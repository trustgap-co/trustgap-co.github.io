import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays } from './helpers.js';

const smsTo = async (t, event) => (await t.db('SELECT to_phone, sms FROM outbox WHERE event = ? ORDER BY id', event));

describe('customer experience', () => {
  test('buyers see the seller’s record on TrustGap before paying', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    let h = (await t.get(`/api/deals/${deal.token}`)).data.deal.seller.history;
    assert.deepEqual({ ...h, joined_at: undefined, invite_code: undefined }, { joined_at: undefined, invite_code: undefined, links_created: 1, paid_orders: 0, completed: 0, disputes: 0, decided_against: 0, ambassador: false });
    assert.match(h.invite_code, /^[A-Z]{1,5}\d{3}$/);
    assert.ok(h.joined_at);

    // A completed order and a dispute decided against the seller both count.
    await buyerPays(t, deal.token);
    const order = await t.one('SELECT * FROM orders');
    await t.db("UPDATE orders SET status = 'completed' WHERE id = ?", order.id);
    await t.db("INSERT INTO disputes (order_id, opened_by, category, description, status, fault, created_at) VALUES (?, 'buyer', 'damaged', 'x', 'resolved', 'seller', ?)", order.id, new Date().toISOString());
    const next = await createDeal(t, seller);
    h = (await t.get(`/api/deals/${next.token}`)).data.deal.seller.history;
    assert.equal(h.links_created, 2);
    assert.equal(h.completed, 1);
    assert.equal(h.disputes, 1);
    assert.equal(h.decided_against, 1);
  });

  test('payment messages reassure both sides and say what to do next', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    await buyerPays(t, deal.token);
    const [buyer] = await smsTo(t, 'payment_received_buyer');
    assert.match(buyer.sms, /payment secured.*held safely.*has been notified.*inspect the item first, then share it/);
    const [s] = await smsTo(t, 'payment_received_seller');
    assert.match(s.sms, /payment confirmed.*Next: pack the item and book pickup/);
  });

  test('every delivery step texts the right people with a next step', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    await buyerPays(t, deal.token);
    const order = await t.one('SELECT * FROM orders');
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue sneakers size 42' }, seller);
    const rt = new URL((await t.one('SELECT rider_url FROM orders')).rider_url).searchParams.get('t');
    await t.post(`/api/rider/${rt}/status`, { status: 'picked_up' });
    assert.match((await smsTo(t, 'delivery_picked_up'))[0].sms, /picked up from the seller/);
    assert.match((await smsTo(t, 'delivery_picked_up_seller'))[0].sms, /courier has collected/);
    await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
    assert.match((await smsTo(t, 'delivery_out_for_delivery'))[0].sms, /inspect it before giving the rider your PIN/);
  });

  test('a problem report gets a case reference and a time for the next update', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken } = await buyerPays(t, deal.token);
    await t.post(`/api/track/${trackToken}/dispute`, { category: 'not_delivered', description: 'Seller stopped replying' });
    const order = await t.one('SELECT * FROM orders');
    const dispute = await t.one('SELECT * FROM disputes');
    const ref = `${order.ref}-C${dispute.id}`;
    const msgs = await smsTo(t, 'dispute_opened');
    assert.match(msgs[0].sms, new RegExp(`we have received your report.*Case ${ref}.*under review.*update you by`));
    assert.match(msgs[1].sms, new RegExp(`Case ${ref}.*Add your side`));
    const view = (await t.get(`/api/track/${trackToken}`)).data.dispute;
    assert.equal(view.case_ref, ref);
    assert.equal(new Date(view.update_by) - new Date(dispute.created_at), 24 * 3_600_000);
    const sellerView = (await t.get(`/api/seller/orders/${order.id}`, seller)).data.dispute;
    assert.equal(sellerView.case_ref, ref);
  });
});
