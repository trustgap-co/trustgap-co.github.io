import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays, DEAL } from './helpers.js';
import { platformFee, deliveryPrice, disputeFee } from '../src/lib/money.js';
import { applyDisputeFee } from '../src/core/orders.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({});
const N = (naira) => naira * 100;
const admin = async (t) => (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;

describe('TrustGap fee: 1.5% to ₦200,000, then 1%, at most ₦15,000', () => {
  test('the tiers', () => {
    const fee = (naira) => platformFee(N(naira), config.fee) / 100;
    assert.equal(fee(5_000), 100); // minimum
    assert.equal(fee(50_000), 750);
    assert.equal(fee(200_000), 3_000);
    assert.equal(fee(500_000), 6_000);
    assert.equal(fee(900_000), 10_000);
    assert.equal(fee(1_400_000), 15_000);
    assert.equal(fee(3_000_000), 15_000); // cap
  });

  test('a flat rate still works without a tier', () => {
    assert.equal(platformFee(N(500_000), { percent: 1.5, minKobo: 0, maxKobo: N(3000) }), N(3000));
  });
});

describe('delivery as TrustGap’s service', () => {
  test('courier price plus 15%, at most ₦2,000 on top, in whole naira', () => {
    assert.equal(deliveryPrice(N(10_000), config.deliveryMargin), N(11_500));
    assert.equal(deliveryPrice(N(2_688), config.deliveryMargin), N(3_092));
    assert.equal(deliveryPrice(N(20_000), config.deliveryMargin), N(22_000)); // capped
    assert.equal(deliveryPrice(N(3_000), { percent: 0 }), N(3_000));
  });

  test('your own riders’ prices are not marked up', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const q = await t.post('/api/seller/quote', DEAL, seller);
    assert.equal(q.data.price.deliveryFee, N(3_225)); // the manual table, unchanged
  });
});

describe('deal limit: ₦1,000,000, then support', () => {
  test('above the limit the seller is sent to support; the admin can raise it for them', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const big = { ...DEAL, item_price: '1,500,000' };
    const r = await t.post('/api/seller/quote', big, seller);
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'needs_support');
    assert.match(r.data.error, /more secure link.*support/);
    assert.equal((await t.post('/api/seller/quote', { ...DEAL, item_price: '1,000,000' }, seller)).status, 200);

    const a = await admin(t);
    const s = await t.one('SELECT id FROM sellers');
    assert.match((await t.post(`/api/admin/sellers/${s.id}`, { action: 'limit', limit: '500000' }, a)).data.error, /above the normal limit/);
    assert.equal((await t.post(`/api/admin/sellers/${s.id}`, { action: 'limit', limit: '2000000', reason: 'Rolex, checked on a call' }, a)).status, 200);
    const created = await t.post('/api/seller/deals', big, seller);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.deal.price.platformFee ?? (await t.one('SELECT platform_fee FROM deals')).platform_fee, N(15_000));
    const listed = (await t.get('/api/admin/sellers', a)).data.sellers[0];
    assert.equal(listed.deal_limit, N(2_000_000));
    assert.match(listed.history[0].reason, /₦2,000,000 · Rolex/);

    // Back to the normal limit.
    await t.post(`/api/admin/sellers/${s.id}`, { action: 'limit', limit: '' }, a);
    assert.equal((await t.post('/api/seller/quote', big, seller)).data.code, 'needs_support');
  });
});

describe('dispute fee: paid by whoever is at fault', () => {
  test('size: 10% of the item, between ₦1,000 and ₦3,000', () => {
    assert.equal(disputeFee(N(5_000), config.disputeFee), N(1_000));
    assert.equal(disputeFee(N(20_000), config.disputeFee), N(2_000));
    assert.equal(disputeFee(N(45_000), config.disputeFee), N(3_000));
    assert.equal(disputeFee(N(45_000), { ...config.disputeFee, maxKobo: 0 }), 0);
  });

  test('who pays, and from what', () => {
    const fee = N(3_000);
    const amounts = { buyerRefund: N(40_000), sellerPayout: 0, sellerCharge: 0 };
    assert.deepEqual(applyDisputeFee(fee, 'buyer', amounts), { buyerRefund: N(37_000), disputeFee: fee, feeTaken: fee });
    assert.deepEqual(applyDisputeFee(fee, 'buyer', { ...amounts, buyerRefund: 0 }), { buyerRefund: 0, disputeFee: 0, feeTaken: 0 });
    assert.deepEqual(applyDisputeFee(fee, 'seller', amounts), { sellerPayout: 0, sellerCharge: fee, disputeFee: fee, feeTaken: 0 });
    assert.deepEqual(applyDisputeFee(fee, 'seller', { ...amounts, sellerPayout: N(1_000) }), { sellerPayout: 0, sellerCharge: N(2_000), disputeFee: fee, feeTaken: N(1_000) });
    assert.deepEqual(applyDisputeFee(fee, 'courier', amounts), { disputeFee: 0, feeTaken: 0 });
    assert.deepEqual(applyDisputeFee(0, 'buyer', amounts), { disputeFee: 0, feeTaken: 0 });
  });

  async function disputedOrder(t) {
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken } = await buyerPays(t, deal.token);
    const r = await t.post(`/api/track/${trackToken}/dispute`, { category: 'not_delivered', description: 'Seller stopped replying after I paid' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return { seller, order: await t.one('SELECT * FROM orders'), dispute: await t.one('SELECT * FROM disputes') };
  }

  test('the deal records its fee; buyers and sellers are told before and when a dispute opens', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const q = await t.post('/api/seller/quote', DEAL, seller);
    assert.equal(q.data.dispute_fee, N(3_000));
    const deal = await createDeal(t, seller);
    assert.equal((await t.one('SELECT dispute_fee FROM deals')).dispute_fee, N(3_000));
    assert.match((await t.one('SELECT condition_pledge FROM deals')).condition_pledge, /plus the dispute fee \(₦3,000\)/);
    const view = (await t.get(`/api/deals/${deal.token}`)).data.deal;
    assert.equal(view.dispute_fee, N(3_000));
    const { trackToken } = await buyerPays(t, deal.token);
    const terms = JSON.parse((await t.one('SELECT terms_json FROM orders')).terms_json);
    assert.equal(terms.money.dispute_fee, N(3_000));
    assert.ok(terms.rules.some((r) => /dispute fee of ₦3,000/.test(r)));
    assert.match(terms.buyer_acknowledgement.text, /plus the dispute fee \(₦3,000\) if TrustGap has to decide it/);
    await t.post(`/api/track/${trackToken}/dispute`, { category: 'not_delivered', description: 'Nothing arrived' });
    const opened = (await t.db("SELECT sms FROM outbox WHERE event = 'dispute_opened'")).map((m) => m.sms);
    assert.equal(opened.length, 2);
    for (const sms of opened) assert.match(sms, /whoever is at fault pays a dispute fee of ₦3,000/);
  });

  test('seller at fault with nothing to pay from: added to what they owe', async () => {
    const t = boot();
    const { order, dispute } = await disputedOrder(t);
    const a = await admin(t);
    assert.match((await t.post(`/api/admin/disputes/${dispute.id}/resolve`, { buyer_refund: '1', seller_payout: '0', note: 'Checking fault is required', fault: 'judge' }, a)).data.error, /at fault/);
    const r = await t.post(`/api/admin/disputes/${dispute.id}/resolve`,
      { buyer_refund: String(order.amount / 100), seller_payout: '0', seller_charge: '0', fault: 'seller', note: 'Seller never shipped and stopped replying.' }, a);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const d = await t.one('SELECT * FROM disputes');
    assert.equal(d.fault, 'seller');
    assert.equal(d.dispute_fee, N(3_000));
    assert.equal(d.buyer_refund, order.amount, 'the buyer still gets everything back');
    assert.equal((await t.one('SELECT amount_owed FROM sellers')).amount_owed, N(3_000));
    const fees = await t.db("SELECT amount, status, counterparty FROM ledger WHERE kind = 'dispute_fee'");
    assert.deepEqual(fees, [{ amount: N(3_000), status: 'owed', counterparty: 'seller' }]);
    const decided = (await t.db("SELECT sms FROM outbox WHERE event = 'dispute_resolved'")).map((m) => m.sms);
    assert.ok(decided.every((s) => /At fault: the seller, who pays the ₦3,000 dispute fee/.test(s)));
  });

  test('buyer at fault: taken from their refund, and kept by TrustGap', async () => {
    const t = boot();
    const { order, dispute } = await disputedOrder(t);
    const a = await admin(t);
    const r = await t.post(`/api/admin/disputes/${dispute.id}/resolve`,
      { buyer_refund: String(order.amount / 100), seller_payout: '0', seller_charge: '0', fault: 'buyer', note: 'Buyer cancelled before shipping; changed their mind.' }, a);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await t.one("SELECT amount FROM ledger WHERE kind = 'buyer_refund'")).amount, order.amount - N(3_000));
    assert.deepEqual(await t.db("SELECT amount, status FROM ledger WHERE kind = 'dispute_fee'"), [{ amount: N(3_000), status: 'success' }]);
    assert.equal(await t.one("SELECT amount FROM ledger WHERE kind = 'platform_retained'"), null, 'the fee isn’t counted twice');
    assert.equal((await t.one('SELECT amount_owed FROM sellers')).amount_owed, 0);
  });

  test('courier or no one at fault: no fee', async () => {
    const t = boot();
    const { order, dispute } = await disputedOrder(t);
    const a = await admin(t);
    await t.post(`/api/admin/disputes/${dispute.id}/resolve`,
      { buyer_refund: String(order.amount / 100), seller_payout: '0', seller_charge: '0', fault: 'courier', note: 'Courier lost the parcel in transit.' }, a);
    assert.equal((await t.one("SELECT amount FROM ledger WHERE kind = 'buyer_refund'")).amount, order.amount);
    assert.equal(await t.one("SELECT * FROM ledger WHERE kind = 'dispute_fee'"), null);
  });
});
