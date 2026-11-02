import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays, DEAL } from './helpers.js';

const ALERT = '08030000001';
const adminToken = async (t) => (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
const NORA = { name: 'Nora', email: 'nora@trustgap.ng', phone: '08051112222', role: 'cr_admin', password: 'temporary-pass-1' };
const MEMBER = { name: 'Ada', email: 'ada@trustgap.ng', phone: '08053334444', role: 'customer_relations', password: 'temporary-pass-2' };

// Nora logs in with her password and the code texted to her phone, and sets her own password.
async function noraToken(t) {
  const first = await t.post('/api/team/login', { email: NORA.email, password: NORA.password });
  assert.equal(first.data.needs_code, true, JSON.stringify(first.data));
  const second = await t.post('/api/team/login', { email: NORA.email, password: NORA.password, code: first.data.dev_code });
  assert.equal(second.status, 200, JSON.stringify(second.data));
  await t.post('/api/team/password', { current_password: NORA.password, new_password: 'nora-own-password-1' }, second.data.token);
  const again = await t.post('/api/team/login', { email: NORA.email, password: 'nora-own-password-1' });
  return (await t.post('/api/team/login', { email: NORA.email, password: 'nora-own-password-1', code: again.data.dev_code })).data.token;
}
async function setup(env = {}) {
  const t = boot({ ADMIN_ALERT_PHONE: ALERT, ...env });
  const admin = await adminToken(t);
  assert.equal((await t.post('/api/admin/team', NORA, admin)).status, 200);
  return { t, admin, nora: await noraToken(t) };
}
async function disputedOrder(t, price = DEAL.item_price) {
  const seller = await onboardSeller(t);
  const deal = await createDeal(t, seller, { ...DEAL, item_price: price });
  const { trackToken } = await buyerPays(t, deal.token);
  await t.post(`/api/track/${trackToken}/dispute`, { category: 'not_delivered', description: 'Seller stopped replying' });
  return { seller, order: await t.one('SELECT * FROM orders ORDER BY id DESC'), dispute: await t.one('SELECT * FROM disputes ORDER BY id DESC') };
}

describe('Customer Relations Admin', () => {
  test('only one, only added by the admin, needs a phone, logs in with a texted code', async () => {
    const { t, admin, nora } = await setup();
    assert.match((await t.post('/api/admin/team', { ...NORA, email: 'two@trustgap.ng' }, admin)).data.error, /already a Customer Relations Admin/);
    assert.match((await t.post('/api/admin/team', { ...NORA, email: 'x@trustgap.ng', phone: '' }, admin)).data.error, /needs a phone/);
    // Nora can add customer relations members, but not another Customer Relations Admin.
    assert.match((await t.post('/api/admin/team', { ...NORA, email: 'y@trustgap.ng' }, nora)).data.error, /Only the admin/);
    const ada = await t.post('/api/admin/team', MEMBER, nora);
    assert.equal(ada.status, 200);
    assert.equal(ada.data.staff.role, 'customer_relations');
    // She can't turn off her own account or change her role's account.
    const me = await t.one("SELECT id FROM staff WHERE role = 'cr_admin'");
    assert.equal((await t.post(`/api/admin/team/${me.id}`, { disabled: true }, nora)).status, 403);
    assert.equal((await t.post(`/api/admin/team/${ada.data.staff.id}`, { disabled: true }, nora)).status, 200);
    // A wrong code is refused.
    assert.match((await t.post('/api/team/login', { email: NORA.email, password: 'nora-own-password-1', code: '000000' })).data.error, /code/i);
  });

  test('what she can and can’t do on the admin pages', async () => {
    const { t, nora } = await setup();
    const { order, dispute } = await disputedOrder(t);
    assert.deepEqual((await t.get('/api/admin/me', nora)).data, { role: 'cr_admin', name: 'Nora' });
    for (const path of ['/api/admin/orders', `/api/admin/orders/${order.id}`, '/api/admin/disputes', '/api/admin/sellers', '/api/admin/outbox', '/api/admin/team']) {
      assert.equal((await t.get(path, nora)).status, 200, path);
    }
    for (const path of ['/api/admin/ledger', '/api/admin/health']) assert.equal((await t.get(path, nora)).status, 403, path);
    assert.equal((await t.post('/api/admin/jobs', {}, nora)).status, 403);
    // Bank account numbers: last 4 digits only.
    assert.match((await t.get(`/api/admin/orders/${order.id}`, nora)).data.seller.payout_account_number, /^••••\d{4}$/);
    // Sellers: suspend yes; unsuspend, verify, debts and limits no.
    const sellerId = order.seller_id;
    assert.equal((await t.post(`/api/admin/sellers/${sellerId}`, { action: 'suspend', reason: 'Fraud report from a buyer' }, nora)).status, 200);
    assert.equal((await t.one('SELECT suspended_by FROM sellers')).suspended_by, 'Nora');
    for (const action of ['unsuspend', 'verify', 'settled', 'limit']) {
      assert.equal((await t.post(`/api/admin/sellers/${sellerId}`, { action, reason: 'x', limit: '2000000' }, nora)).status, 403, action);
    }
    // She decides any dispute, recorded under her name.
    const r = await t.post(`/api/admin/disputes/${dispute.id}/resolve`,
      { buyer_refund: String(order.amount / 100), seller_payout: '0', fault: 'seller', note: 'Seller never shipped; full refund.' }, nora);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await t.one('SELECT decided_by FROM disputes')).decided_by, 'team:Nora');
  });

  test('customer relations members decide only up to ₦200,000; Nora decides any amount', async () => {
    const { t, nora } = await setup();
    const ada = (await t.post('/api/admin/team', MEMBER, nora)).data.staff;
    const big = await disputedOrder(t, '450,000');
    const task = await t.post('/api/admin/tasks', { title: 'Decide this', assigned_to: ada.id, kind: 'decide_dispute', order_ref: big.order.ref }, nora);
    assert.equal(task.status, 403);
    assert.match(task.data.error, /only the Customer Relations Admin or the admin/);
    const r = await t.post(`/api/admin/disputes/${big.dispute.id}/resolve`,
      { buyer_refund: String(big.order.amount / 100), seller_payout: '0', fault: 'seller', note: 'Seller never shipped; full refund.' }, nora);
    assert.equal(r.status, 200, JSON.stringify(r.data));
  });

  test('every new dispute texts the admin and Nora; her decisions text the admin', async () => {
    const { t, nora } = await setup();
    const { order, dispute } = await disputedOrder(t);
    const alerts = await t.db("SELECT to_phone, sms FROM outbox WHERE event = 'staff_alert_dispute' ORDER BY id");
    assert.deepEqual(alerts.map((a) => a.to_phone).sort(), ['+2348030000001', '+2348051112222']);
    assert.match(alerts[0].sms, new RegExp(`new dispute ${order.ref}-C${dispute.id}, "Item not delivered".*opened by the buyer.*admin/order.html\\?id=${order.id}`));
    await t.post(`/api/admin/disputes/${dispute.id}/resolve`,
      { buyer_refund: String(order.amount / 100), seller_payout: '0', fault: 'courier', note: 'Courier lost the parcel in transit.' }, nora);
    const told = await t.db("SELECT to_phone, sms FROM outbox WHERE event = 'staff_alert_decision'");
    assert.equal(told.length, 1);
    assert.equal(told[0].to_phone, '+2348030000001');
    assert.match(told[0].sms, /Nora decided case/);
  });
});

describe('changing a role and deleting accounts', () => {
  test('an existing member can be made the Customer Relations Admin, keeping their account', async () => {
    const t = boot({ ADMIN_ALERT_PHONE: ALERT });
    const admin = await adminToken(t);
    const ada = (await t.post('/api/admin/team', { ...MEMBER, phone: '' }, admin)).data.staff;
    assert.match((await t.post(`/api/admin/team/${ada.id}`, { role: 'cr_admin' }, admin)).data.error, /needs a phone/);
    const r = await t.post(`/api/admin/team/${ada.id}`, { role: 'cr_admin', phone: '08053334444' }, admin);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.staff.role, 'cr_admin');
    assert.equal(r.data.staff.id, ada.id);
    // Now her login needs the texted code.
    assert.equal((await t.post('/api/team/login', { email: MEMBER.email, password: MEMBER.password })).data.needs_code, true);
    // Only one at a time.
    const other = (await t.post('/api/admin/team', { ...MEMBER, email: 'b@trustgap.ng' }, admin)).data.staff;
    assert.match((await t.post(`/api/admin/team/${other.id}`, { role: 'cr_admin' }, admin)).data.error, /already a Customer Relations Admin/);
  });

  test('delete only accounts with no tasks; the CR Admin can’t delete herself or change roles', async () => {
    const { t, admin, nora } = await setup();
    const ada = (await t.post('/api/admin/team', MEMBER, nora)).data.staff;
    const listed = (await t.get('/api/admin/team', admin)).data.staff.find((s) => s.id === ada.id);
    assert.equal(listed.can_delete, true);
    assert.equal((await t.post(`/api/admin/team/${ada.id}`, { role: 'cr_admin' }, nora)).status, 403);
    await t.post('/api/admin/tasks', { title: 'Call the buyer', assigned_to: ada.id }, nora);
    assert.match((await t.post(`/api/admin/team/${ada.id}/delete`, {}, admin)).data.error, /Turn it off instead/);
    const temp = (await t.post('/api/admin/team', { ...MEMBER, email: 'oops@trustgap.ng' }, nora)).data.staff;
    const me = await t.one("SELECT id FROM staff WHERE role = 'cr_admin'");
    assert.equal((await t.post(`/api/admin/team/${me.id}/delete`, {}, nora)).status, 403);
    assert.equal((await t.post(`/api/admin/team/${temp.id}/delete`, {}, nora)).status, 200);
    assert.equal(await t.one('SELECT id FROM staff WHERE id = ?', temp.id), null);
  });
});
