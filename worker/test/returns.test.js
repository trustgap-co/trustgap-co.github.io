import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays, PHOTO } from './helpers.js';

const lastOrder = (t) => t.one('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
const adminToken = async (t) => (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
const tokenOf = (url) => new URL(url).searchParams.get('t');

// A delivered order where the buyer then reports a damaged item (the rider has left).
async function deliveredThenReported(t) {
  const seller = await onboardSeller(t);
  const deal = await createDeal(t, seller);
  const { trackToken, track } = await buyerPays(t, deal.token);
  let order = await lastOrder(t);
  await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box, size tag 42' }, seller);
  const rt = tokenOf(order.rider_url || (await lastOrder(t)).rider_url);
  await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
  await t.post(`/api/rider/${rt}/pin`, { pin: track.order.pin });
  await t.post(`/api/track/${trackToken}/dispute`, { category: 'damaged', description: 'Sole is torn on the left shoe', photos: [PHOTO] });
  order = await lastOrder(t);
  assert.equal(order.status, 'disputed');
  const admin = await adminToken(t);
  const dispute = await t.one('SELECT * FROM disputes');
  return { t, seller, admin, order, dispute, trackToken };
}

const decide = (t, admin, dispute, body) => t.post(`/api/admin/disputes/${dispute.id}/resolve`,
  { buyer_refund: '49957', seller_payout: '0', seller_charge: '6450', note: 'Photos show a torn sole. Item goes back to the seller.', ...body }, admin);

describe('returns after delivery', () => {
  test('a refund that needs the item back waits until the seller enters the return PIN', async () => {
    const { t, seller, admin, order, dispute, trackToken } = await deliveredThenReported(await boot());
    const r = await decide(t, admin, dispute, {});
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.waiting_for_return, true);
    assert.equal((await lastOrder(t)).status, 'disputed');
    assert.equal((await t.one('SELECT status FROM disputes')).status, 'awaiting_return');
    assert.equal((await t.one("SELECT COUNT(*) n FROM ledger WHERE kind = 'buyer_refund'")).n, 0);

    const ret = await t.one('SELECT * FROM returns');
    assert.equal(ret.kind, 'pickup');
    assert.equal(ret.status, 'booked');
    assert.ok(ret.deadline_at);
    const sms = (await t.db('SELECT to_phone, sms FROM outbox')).map((m) => m.sms);
    assert.ok(sms.some((m) => /a rider will collect .* to return it to the seller/.test(m)), 'buyer told a rider is coming');
    assert.ok(sms.some((m) => /refund is sent once the seller has the item back/.test(m)), 'both told the refund waits');

    // Buyer and seller pages show the return; only the seller sees the PIN.
    const buyerView = (await t.get(`/api/track/${trackToken}`)).data.return;
    assert.equal(buyerView.status, 'booked');
    assert.equal(buyerView.pin, undefined);
    const sellerView = (await t.get(`/api/seller/orders/${order.id}`, seller)).data.return;
    assert.match(sellerView.pin, /^\d{4}$/);

    // The return rider link: pick up at the buyer, deliver to the seller.
    const rt = tokenOf(ret.rider_url);
    const job = (await t.get(`/api/rider/${rt}`)).data.order;
    assert.equal(job.mode, 'return');
    assert.equal(job.pickup.address, order.delivery_address);
    assert.equal((await t.post(`/api/rider/${rt}/status`, { status: 'picked_up' })).status, 200);
    assert.equal((await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' })).status, 200);
    assert.equal((await t.post(`/api/rider/${rt}/pin`, { pin: sellerView.pin })).status, 400, 'a return link has no delivery PIN');
    assert.equal((await t.post(`/api/rider/${rt}/return-pin`, { pin: sellerView.pin })).status, 200);

    const o = await lastOrder(t);
    assert.equal(o.status, 'refunded');
    const refund = await t.one("SELECT amount FROM ledger WHERE kind = 'buyer_refund'");
    assert.equal(refund.amount, 4_995_700);
    assert.equal((await t.one('SELECT amount_owed FROM sellers')).amount_owed, 645_000);
    assert.equal((await t.one('SELECT status, received_by FROM returns')).received_by, 'rider');
    assert.equal((await t.get(`/api/seller/orders/${order.id}`, seller)).data.return.pin, undefined, 'PIN hidden once received');
  });

  test('the seller can confirm they have it back themselves', async () => {
    const { t, seller, admin, order, dispute } = await deliveredThenReported(await boot());
    await decide(t, admin, dispute, {});
    assert.equal((await t.post(`/api/seller/orders/${order.id}/return-received`, {}, seller)).status, 200);
    assert.equal((await lastOrder(t)).status, 'refunded');
    assert.equal((await t.post(`/api/seller/orders/${order.id}/return-received`, {}, seller)).status, 400, 'only once');
  });

  test('staff can cancel a return (buyer never handed it over) and decide again', async () => {
    const { t, admin, dispute } = await deliveredThenReported(await boot());
    await decide(t, admin, dispute, {});
    const ret = await t.one('SELECT * FROM returns');
    assert.equal((await t.post(`/api/admin/returns/${ret.id}/cancel`, { note: 'x' }, admin)).status, 400, 'needs a reason');
    assert.equal((await t.post(`/api/admin/returns/${ret.id}/cancel`, { note: 'Buyer did not hand it over in 3 days' }, admin)).status, 200);
    assert.equal((await t.one('SELECT status FROM disputes')).status, 'open');
    const again = await decide(t, admin, dispute, { buyer_refund: '0', seller_payout: '45000', seller_charge: '0', note: 'Buyer kept the item; seller is paid.' });
    assert.equal(again.data.waiting_for_return, false);
    assert.equal((await lastOrder(t)).status, 'completed');
  });

  test('every refund after delivery needs the item back; paying the seller moves money at once', async () => {
    const { t, admin, dispute } = await deliveredThenReported(await boot());
    const r = await decide(t, admin, dispute, { buyer_refund: '1000', note: 'Small refund, still needs the item back.' });
    assert.equal(r.data.waiting_for_return, true, 'no way to refund and let the buyer keep it');
    assert.equal((await t.one('SELECT COUNT(*) n FROM returns')).n, 1);
    const ret = await t.one('SELECT * FROM returns');
    await t.post(`/api/admin/returns/${ret.id}/cancel`, { note: 'Buyer did not hand it over' }, admin);
    const paySeller = await decide(t, admin, dispute, { buyer_refund: '0', seller_payout: '45000', seller_charge: '0', note: 'Buyer kept the item; seller is paid.' });
    assert.equal(paySeller.data.waiting_for_return, false);
    assert.equal((await lastOrder(t)).status, 'completed');
  });

  test('staff can mark a return received', async () => {
    const { t, admin, dispute } = await deliveredThenReported(await boot());
    await decide(t, admin, dispute, {});
    const ret = await t.one('SELECT * FROM returns');
    const view = (await t.get(`/api/admin/orders/${ret.order_id}`, admin)).data.return;
    assert.equal(view.status, 'booked');
    assert.equal(view.overdue, false);
    assert.equal((await t.post(`/api/admin/returns/${ret.id}/received`, {}, admin)).status, 200);
    assert.equal((await lastOrder(t)).status, 'refunded');
  });
});

describe('the seller is never paid as well as getting the item back', () => {
  test('door refusal: once the parcel is going back, a payout to the seller is refused', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    await buyerPays(t, deal.token);
    let order = await lastOrder(t);
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box' }, seller);
    order = await lastOrder(t);
    const rt = tokenOf(order.rider_url);
    await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
    await t.post(`/api/rider/${rt}/status`, { status: 'refused', note: 'Buyer changed their mind' });
    const admin = await adminToken(t);
    const dispute = await t.one('SELECT * FROM disputes');
    const pay = await decide(t, admin, dispute, { buyer_refund: '0', seller_payout: '45000', seller_charge: '0', note: 'Item was correct, pay the seller.' });
    assert.equal(pay.status, 400);
    assert.match(pay.data.error, /back with the seller.*can’t also be paid/);
    const ok = await decide(t, admin, dispute, { buyer_refund: String((order.amount - 2 * order.delivery_fee) / 100), seller_payout: '0', seller_charge: '0', note: 'Correct item refused: refund minus both trips.' });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
  });

  test('after delivery: a refund and a seller payout can’t be combined', async () => {
    const { t, admin, dispute } = await deliveredThenReported(await boot());
    const both = await decide(t, admin, dispute, { buyer_refund: '20000', seller_payout: '20000', note: 'Split it down the middle somehow.' });
    assert.match(both.data.error, /refund means the item goes back.*not both/);
    assert.equal((await t.one('SELECT COUNT(*) n FROM returns')).n, 0, 'nothing booked');
  });
});
