import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays, PHOTO } from './helpers.js';

const adminToken = async (t) => (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
const MEMBER = { name: 'Ada Customer', email: 'ada@trustgap.ng', phone: '08051112222', role: 'customer_relations', password: 'temporary-pass-1' };

async function withMember(t) {
  const admin = await adminToken(t);
  const created = await t.post('/api/admin/team', MEMBER, admin);
  assert.equal(created.status, 200, JSON.stringify(created.data));
  return { admin, staff: created.data.staff };
}
async function memberLogin(t, password = MEMBER.password) {
  return t.post('/api/team/login', { email: 'ADA@trustgap.ng', password });
}
async function readyMember(t) {
  const token = (await memberLogin(t)).data.token;
  await t.post('/api/team/password', { current_password: MEMBER.password, new_password: 'my-own-password-22' }, token);
  return token;
}

describe('team members', () => {
  test('admin creates a member; password stored hashed; first login must set a new password', async () => {
    const t = boot();
    const { staff } = await withMember(t);
    assert.equal(staff.must_change_password, true);
    const row = await t.one('SELECT password_hash FROM staff');
    assert.match(row.password_hash, /^pbkdf2\$100000\$/);
    assert.ok(!row.password_hash.includes(MEMBER.password));

    assert.equal((await memberLogin(t, 'wrong-password-123')).status, 401);
    const login = await memberLogin(t);
    assert.equal(login.status, 200);
    const token = login.data.token;
    assert.equal((await t.get('/api/team/tasks', token)).status, 403, 'blocked until the password is changed');
    assert.match((await t.post('/api/team/password', { current_password: MEMBER.password, new_password: 'short' }, token)).data.error, /at least 10/);
    assert.equal((await t.post('/api/team/password', { current_password: MEMBER.password, new_password: 'my-own-password-22' }, token)).status, 200);
    assert.equal((await t.get('/api/team/tasks', token)).status, 200);
    assert.equal((await memberLogin(t)).status, 401, 'old password no longer works');
  });

  test('team members are not admins and admins-only routes stay closed', async () => {
    const t = boot();
    await withMember(t);
    const token = await readyMember(t);
    assert.equal((await t.get('/api/admin/orders', token)).status, 401);
    assert.equal((await t.get('/api/admin/team', token)).status, 401);
    assert.equal((await t.post('/api/admin/tasks', { title: 'x' }, token)).status, 401);
  });

  test('repeated wrong passwords lock the account for 15 minutes; disabling signs them out', async () => {
    const t = boot();
    const { admin, staff } = await withMember(t);
    const token = await readyMember(t);
    for (let i = 0; i < 8; i++) await memberLogin(t, 'nope-nope-nope-' + i);
    assert.equal((await memberLogin(t, 'my-own-password-22')).status, 429);
    await t.post(`/api/admin/team/${staff.id}`, { disabled: true }, admin);
    assert.equal((await t.get('/api/team/tasks', token)).status, 401);
  });
});

describe('tasks', () => {
  test('admin assigns a task about an order; the member is told, works it and sees that order read only', async () => {
    const t = boot();
    const { admin, staff } = await withMember(t);
    const token = await readyMember(t);
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    await buyerPays(t, deal.token);
    const order = await t.one('SELECT * FROM orders');

    assert.match((await t.post('/api/admin/tasks', { title: 'Call buyer', assigned_to: staff.id, order_ref: 'TG-NOPE00' }, admin)).data.error, /No order/);
    const created = await t.post('/api/admin/tasks', {
      title: 'Call the buyer about delivery', details: 'They asked when it ships.', assigned_to: staff.id,
      order_ref: order.ref.toLowerCase(), priority: 'high', due_date: '2026-11-02',
    }, admin);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const task = created.data.task;
    assert.equal(task.order_ref, order.ref);
    const sms = await t.one("SELECT to_phone, sms FROM outbox WHERE event = 'task_assigned'");
    assert.equal(sms.to_phone, '+2348051112222');
    assert.match(sms.sms, /Call the buyer about delivery/);

    const mine = (await t.get('/api/team/tasks', token)).data.tasks;
    assert.equal(mine.length, 1);
    assert.equal((await t.post(`/api/team/tasks/${task.id}/status`, { status: 'in_progress' }, token)).data.task.status, 'in_progress');
    const noted = (await t.post(`/api/team/tasks/${task.id}/notes`, { body: 'Spoke to buyer at 10am, seller ships today.' }, token)).data.task;
    assert.equal(noted.notes.at(-1).author, 'Ada Customer');

    const view = await t.get(`/api/team/orders/${order.id}`, token);
    assert.equal(view.status, 200);
    assert.equal(view.data.order.ref, order.ref);
    const text = JSON.stringify(view.data);
    for (const secret of ['refund_account', 'delivery_pin', 'payout_account', order.refund_account_last4]) assert.ok(!text.includes(secret), secret);

    const other = await t.post('/api/admin/tasks', { title: 'Unrelated', assigned_to: staff.id }, admin);
    assert.equal(other.data.task.order_id, null);
    await t.post('/api/admin/tasks/' + task.id, { order_ref: '' }, admin);
    assert.equal((await t.get(`/api/team/orders/${order.id}`, token)).status, 403, 'only orders their tasks are about');

    const board = (await t.get('/api/admin/team', admin)).data;
    assert.equal(board.tasks.length, 2);
    assert.equal(board.staff[0].email, 'ada@trustgap.ng');
  });

  test('a member only sees and changes their own tasks', async () => {
    const t = boot();
    const { admin, staff } = await withMember(t);
    const second = (await t.post('/api/admin/team', { ...MEMBER, email: 'tolu@trustgap.ng', name: 'Tolu' }, admin)).data.staff;
    const theirs = (await t.post('/api/admin/tasks', { title: 'For Tolu only', assigned_to: second.id }, admin)).data.task;
    const token = await readyMember(t);
    assert.equal((await t.get('/api/team/tasks', token)).data.tasks.length, 0);
    assert.equal((await t.post(`/api/team/tasks/${theirs.id}/status`, { status: 'done' }, token)).status, 404);
    assert.equal(staff.id !== second.id, true);
  });
});

describe('team manual', () => {
  test('only the admin and signed-in team members can read it', async () => {
    const t = boot();
    assert.equal((await t.get('/api/manual')).status, 401);
    const seller = await onboardSeller(t);
    assert.equal((await t.get('/api/manual', seller)).status, 401, 'sellers cannot read it');
    const { admin } = await withMember(t);
    const fresh = (await memberLogin(t)).data.token;
    assert.equal((await t.get('/api/manual', fresh)).status, 403, 'not before setting their own password');
    const manual = (await t.get('/api/manual', admin)).data.manual;
    assert.ok(manual.sections.length >= 8);
    assert.ok(manual.sections.some((s) => s.id === 'returns'));
    const token = await readyMember(t);
    assert.equal((await t.get('/api/manual', token)).status, 200);
  });
});

describe('team members deciding disputes', () => {
  // A delivered order whose buyer reported a problem (so there's an open dispute).
  async function disputedOrder(t) {
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken, track } = await buyerPays(t, deal.token);
    let order = await t.one('SELECT * FROM orders');
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box, size tag 42' }, seller);
    order = await t.one('SELECT * FROM orders');
    const rt = new URL(order.rider_url).searchParams.get('t');
    await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
    await t.post(`/api/rider/${rt}/pin`, { pin: track.order.pin });
    await t.post(`/api/track/${trackToken}/dispute`, { category: 'damaged', description: 'Sole is torn', photos: [PHOTO] });
    return { seller, order: await t.one('SELECT * FROM orders'), dispute: await t.one('SELECT * FROM disputes') };
  }
  const DECISION = { buyer_refund: '0', seller_payout: '45000', seller_charge: '0', note: 'Photos show normal wear, not a defect. Seller is paid.' };

  test('only with a "Decide a dispute" task for that order, and only while it is open', async () => {
    const t = boot();
    const { admin, staff } = await withMember(t);
    const token = await readyMember(t);
    const { order, dispute } = await disputedOrder(t);

    assert.match((await t.post('/api/admin/tasks', { title: 'Decide', kind: 'decide_dispute', assigned_to: staff.id }, admin)).data.error, /needs the order reference/);
    const general = (await t.post('/api/admin/tasks', { title: 'Call buyer', assigned_to: staff.id, order_ref: order.ref }, admin)).data.task;
    assert.equal((await t.post(`/api/team/disputes/${dispute.id}/resolve`, DECISION, token)).status, 403, 'a general task is not enough');
    assert.equal((await t.get(`/api/team/orders/${order.id}`, token)).data.decide, null);

    const task = (await t.post('/api/admin/tasks', { title: 'Decide TG dispute', kind: 'decide_dispute', assigned_to: staff.id, order_ref: order.ref }, admin)).data.task;
    assert.equal(task.kind_label, 'Decide a dispute');
    const view = (await t.get(`/api/team/orders/${order.id}`, token)).data;
    assert.equal(view.decide.dispute_id, dispute.id);
    assert.equal(view.disputes[0].photos.length, 1, 'she sees the evidence');
    assert.ok(!JSON.stringify(view).includes('refund_account'));

    assert.match((await t.post(`/api/team/disputes/${dispute.id}/resolve`, { ...DECISION, seller_payout: '999999' }, token)).data.error, /cannot exceed/, 'same checks as admin');
    const r = await t.post(`/api/team/disputes/${dispute.id}/resolve`, DECISION, token);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await t.one('SELECT status FROM orders')).status, 'completed');
    const d = await t.one('SELECT status, decided_by FROM disputes');
    assert.deepEqual([d.status, d.decided_by], ['resolved', 'team:Ada Customer']);
    const ev = await t.one("SELECT actor FROM order_events WHERE type = 'dispute_resolved'");
    assert.equal(ev.actor, 'team:Ada Customer');
    const done = (await t.get('/api/team/tasks', token)).data.tasks.find((x) => x.id === task.id);
    assert.equal(done.status, 'done');
    assert.match(done.notes.at(-1).body, /^Decided: refund ₦0, seller paid ₦45,000/);
    assert.equal((await t.post(`/api/team/disputes/${dispute.id}/resolve`, DECISION, token)).status, 403, 'not twice');
    assert.equal(general.status, 'todo');
  });

  test('a refund she decides follows the return rule like the admin’s', async () => {
    const t = boot();
    const { admin, staff } = await withMember(t);
    const token = await readyMember(t);
    const { order, dispute } = await disputedOrder(t);
    await t.post('/api/admin/tasks', { title: 'Decide', kind: 'decide_dispute', assigned_to: staff.id, order_ref: order.ref }, admin);
    const r = await t.post(`/api/team/disputes/${dispute.id}/resolve`, { buyer_refund: '49957', seller_payout: '0', seller_charge: '6450', note: 'Torn sole in photos; item goes back.' }, token);
    assert.equal(r.data.waiting_for_return, true);
    assert.equal((await t.one('SELECT status, decided_by FROM disputes')).decided_by, 'team:Ada Customer');
    await t.post(`/api/admin/returns/${(await t.one('SELECT id FROM returns')).id}/received`, {}, admin);
    const d = await t.one('SELECT status, decided_by FROM disputes');
    assert.deepEqual([d.status, d.decided_by], ['resolved', 'team:Ada Customer'], 'still credited to her when the money moves');
  });

  test('another member, or a task marked done, cannot decide', async () => {
    const t = boot();
    const { admin, staff } = await withMember(t);
    const token = await readyMember(t);
    const { order, dispute } = await disputedOrder(t);
    const task = (await t.post('/api/admin/tasks', { title: 'Decide', kind: 'decide_dispute', assigned_to: staff.id, order_ref: order.ref }, admin)).data.task;
    await t.post(`/api/team/tasks/${task.id}/status`, { status: 'done' }, token);
    assert.equal((await t.post(`/api/team/disputes/${dispute.id}/resolve`, DECISION, token)).status, 403);
    assert.equal((await t.one('SELECT status FROM disputes')).status, 'open');
  });
});
