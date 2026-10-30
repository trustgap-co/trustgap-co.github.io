import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays, DEAL } from './helpers.js';

const adminToken = async (t) => (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
const lastOrder = (t) => t.one('SELECT * FROM orders ORDER BY id DESC LIMIT 1');

describe('suspending a seller', () => {
  test('stops new business, holds payouts, tells the seller, and lets paid orders be completed', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const paidDeal = await createDeal(t, seller);
    const openDeal = await createDeal(t, seller, { ...DEAL, item_title: 'Second pair, size 43' });
    const { trackToken, track } = await buyerPays(t, paidDeal.token);
    const order = await lastOrder(t);
    let admin = await adminToken(t);
    const sellerId = (await t.one('SELECT id FROM sellers')).id;

    assert.match((await t.post(`/api/admin/sellers/${sellerId}`, { action: 'suspend' }, admin)).data.error, /Give a reason/);
    assert.equal((await t.post(`/api/admin/sellers/${sellerId}`, { action: 'suspend', reason: 'Several buyers reported fake items' }, admin)).status, 200);

    // The seller is told, sees why, and can't start anything new.
    assert.ok((await t.db('SELECT sms FROM outbox')).some((m) => /account is suspended\. Reason: Several buyers reported fake items/.test(m.sms)));
    const me = (await t.get('/api/seller/me', seller)).data.seller;
    assert.equal(me.suspended, true);
    assert.equal(me.suspend_reason, 'Several buyers reported fake items');
    assert.match((await t.post('/api/seller/deals', DEAL, seller)).data.error, /suspended/);
    assert.match((await t.post('/api/seller/quote', DEAL, seller)).data.error, /suspended/);

    // Their open links stop taking payments.
    assert.equal((await t.get(`/api/deals/${openDeal.token}`)).data.deal.status, 'paused');
    const accept = await t.post(`/api/deals/${openDeal.token}/accept`, { penalty_acknowledged: true, terms_accepted: true });
    assert.equal(accept.status, 410);

    // The buyer who already paid still gets their item: pickup, delivery and release work...
    assert.equal((await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box, size 42' }, seller)).status, 200);
    const rt = new URL((await lastOrder(t)).rider_url).searchParams.get('t');
    await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
    await t.post(`/api/rider/${rt}/pin`, { pin: track.order.pin });
    assert.equal((await t.post(`/api/track/${trackToken}/accept`, {})).status, 200);
    // ...but the payout is held.
    t.advanceHours(24 * 5); // past the next-working-day settlement, even over a weekend
    await t.scheduled();
    assert.equal((await t.one("SELECT status FROM ledger WHERE kind = 'seller_payout'")).status, 'held');
    admin = await adminToken(t); // days have passed: log in again
    const listed = (await t.get('/api/admin/sellers', admin)).data.sellers[0];
    assert.equal(listed.held, (await t.one("SELECT amount FROM ledger WHERE kind = 'seller_payout'")).amount);
    assert.equal(listed.history[0].action, 'suspended');

    // Unsuspending releases the held payout and tells the seller.
    const un = await t.post(`/api/admin/sellers/${sellerId}`, { action: 'unsuspend', reason: 'Checked: items were genuine' }, admin);
    assert.equal(un.data.released, 1);
    assert.equal((await t.one("SELECT status FROM ledger WHERE kind = 'seller_payout'")).status, 'success');
    assert.ok((await t.db('SELECT sms FROM outbox')).some((m) => /active again/.test(m.sms)));
    assert.equal((await t.post('/api/seller/deals', DEAL, seller)).status, 200, 'they can create links again');
    assert.deepEqual((await t.get('/api/admin/sellers', admin)).data.sellers[0].history.map((h) => h.action), ['unsuspended', 'suspended']);
  });

  test('payouts already waiting when the seller is suspended are held too', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken, track } = await buyerPays(t, deal.token);
    const order = await lastOrder(t);
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box' }, seller);
    const rt = new URL((await lastOrder(t)).rider_url).searchParams.get('t');
    await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
    await t.post(`/api/rider/${rt}/pin`, { pin: track.order.pin });
    await t.post(`/api/track/${trackToken}/accept`, {});
    assert.equal((await t.one("SELECT status FROM ledger WHERE kind = 'seller_payout'")).status, 'pending', 'waiting for settlement');
    const admin = await adminToken(t);
    await t.post(`/api/admin/sellers/${(await t.one('SELECT id FROM sellers')).id}`, { action: 'suspend', reason: 'Under investigation' }, admin);
    assert.equal((await t.one("SELECT status FROM ledger WHERE kind = 'seller_payout'")).status, 'held');
    t.advanceHours(24 * 5); // past the next-working-day settlement, even over a weekend
    await t.scheduled();
    assert.equal((await t.one("SELECT status FROM ledger WHERE kind = 'seller_payout'")).status, 'held', 'the timers don’t send it');
  });
});

describe('admin records by date', () => {
  test('lists filter by Lagos dates (both days included) and sort newest or oldest first', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    await buyerPays(t, (await createDeal(t, seller)).token);
    const firstDay = new Date(Date.now()).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
    t.advanceHours(48);
    await buyerPays(t, (await createDeal(t, seller, { ...DEAL, item_title: 'Later order' })).token);
    const admin = await adminToken(t);
    const later = new Date(Date.now() + 48 * 3600_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

    const all = (await t.get('/api/admin/orders', admin)).data.orders;
    assert.equal(all.length, 2);
    assert.equal(all[0].item_title, 'Later order', 'newest first by default');
    assert.equal((await t.get('/api/admin/orders?order=oldest', admin)).data.orders[0].item_title, DEAL.item_title);
    const one = (await t.get(`/api/admin/orders?from=${firstDay}&to=${firstDay}`, admin)).data.orders;
    assert.deepEqual(one.map((o) => o.item_title), [DEAL.item_title]);
    const ledger = (await t.get(`/api/admin/ledger?from=${later}&to=${later}`, admin)).data;
    assert.ok(ledger.entries.length > 0 && ledger.entries.every((e) => e.created_at >= new Date(`${later}T00:00:00+01:00`).toISOString()));
    assert.equal(ledger.totals.find((x) => x.kind === 'collected').total, ledger.entries.find((e) => e.kind === 'collected').amount, 'totals for the period only');
    assert.equal((await t.get('/api/admin/orders?from=nonsense', admin)).data.orders.length, 2, 'bad dates are ignored');
  });
});
