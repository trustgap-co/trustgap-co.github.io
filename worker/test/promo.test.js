import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, completePayment, DEAL, BUYER } from './helpers.js';

// Every order must still add up: what the buyer pays = delivery + TrustGap fee + processing + seller payout,
// and the TrustGap fee can only go down to zero, never below. So the code costs TrustGap at most its own fee.
async function assertBooksBalance(t) {
  for (const o of await t.db('SELECT * FROM orders')) {
    assert.equal(o.amount - o.seller_payout, o.delivery_fee + o.platform_fee + o.processing_fee, `order ${o.ref} adds up`);
    assert.ok(o.platform_fee >= 0, 'TrustGap never pays out more than its fee');
  }
}

async function buyWithCode(t, dealToken, code, buyer = BUYER) {
  const accept = await t.post(`/api/deals/${dealToken}/accept`, { penalty_acknowledged: true, ...(code ? { promo_code: code } : {}) });
  if (accept.status !== 200) return accept;
  const pay = await t.post(`/api/deals/${dealToken}/pay`, { ...buyer, checkout_id: accept.data.checkout_id, expected_total: accept.data.total });
  if (pay.status !== 200) return pay;
  const trackToken = await completePayment(t, pay.data.payment_url);
  return { status: 200, accept: accept.data, track: (await t.get(`/api/track/${trackToken}`)).data };
}

describe('early-access code (EARLYGAP)', () => {
  test('seller: the link has no TrustGap fee, shown in the preview first', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const normal = (await t.post('/api/seller/quote', DEAL, seller)).data;
    const preview = (await t.post('/api/seller/quote', { ...DEAL, promo_code: ' earlygap ' }, seller)).data;
    assert.equal(preview.promo.code, 'EARLYGAP');
    assert.equal(preview.promo.saving, 67_500, '1.5% of ₦45,000');
    assert.equal(preview.price.platformFee, 0);
    assert.ok(preview.price.buyerTotal < normal.price.buyerTotal);
    const deal = await createDeal(t, seller, { ...DEAL, promo_code: 'EarlyGap' });
    assert.equal(deal.price.platformFee, 0);
    assert.equal(deal.promo_code, 'EARLYGAP');
    const view = (await t.get(`/api/deals/${deal.token}`)).data.deal;
    assert.equal(view.promo_applied, true);
    assert.equal(view.price.platform_fee, 0);
    const r = await buyWithCode(t, deal.token);
    assert.equal(r.track.order.price.platform_fee, 0);
    await assertBooksBalance(t);
  });

  test('seller: once per account, but a link that expires unpaid gives the code back', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const first = await createDeal(t, seller, { ...DEAL, promo_code: 'EARLYGAP' });
    assert.match((await t.post('/api/seller/deals', { ...DEAL, promo_code: 'EARLYGAP' }, seller)).data.error, /already used/);
    const revised = await createDeal(t, seller, { ...DEAL, promo_code: 'EARLYGAP', item_price: '44,000', replaces: first.id });
    assert.equal(revised.price.platformFee, 0, 'revising the same link keeps the code');
    t.advanceHours(25);
    await t.scheduled(); // the link expires unpaid
    const again = await createDeal(t, seller, { ...DEAL, promo_code: 'EARLYGAP' });
    assert.equal(again.price.platformFee, 0);
  });

  test('wrong, expired and used-up codes are refused', async () => {
    const t = boot({ PROMO_MAX_USES: '1', PROMO_ENDS: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) });
    const seller = await onboardSeller(t);
    assert.match((await t.post('/api/seller/quote', { ...DEAL, promo_code: 'FREEMONEY' }, seller)).data.error, /isn’t valid/);
    await createDeal(t, seller, { ...DEAL, promo_code: 'EARLYGAP' });
    const other = await onboardSeller(t, { ...(await import('./helpers.js')).SELLER, phone: '0803 999 0000', email: 'x@example.com' });
    assert.match((await t.post('/api/seller/quote', { ...DEAL, promo_code: 'EARLYGAP' }, other)).data.error, /fully used/);
    t.advanceHours(72);
    assert.match((await t.post('/api/seller/quote', { ...DEAL, promo_code: 'EARLYGAP' }, other)).data.error, /expired/);
    const off = boot({ PROMO_CODE: '' });
    const s2 = await onboardSeller(off);
    assert.match((await off.post('/api/seller/quote', { ...DEAL, promo_code: 'EARLYGAP' }, s2)).data.error, /isn’t valid/);
  });

  test('buyer: removes their share of the fee, once per phone number', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller); // buyer pays the fees
    const r = await buyWithCode(t, deal.token, 'earlygap');
    assert.equal(r.accept.promo.discount, 67_500);
    assert.equal(r.accept.total, 4_995_700 - 67_500);
    assert.equal(r.track.order.amount, 4_995_700 - 67_500);
    assert.equal(r.track.order.price.platform_fee, 0);
    assert.equal(r.track.order.price.promo_discount, 67_500);
    const o = await t.one('SELECT * FROM orders');
    assert.equal(o.seller_payout, 4_500_000, 'the seller still gets exactly the same');
    assert.equal(JSON.parse(o.terms_json).money.promo_discount, 67_500, 'the discount is part of the accepted terms');

    const deal2 = await createDeal(t, seller);
    const again = await buyWithCode(t, deal2.token, 'EARLYGAP');
    assert.equal(again.status, 409);
    assert.match(again.data.error, /already used the early-access code/);
    const friend = await buyWithCode(t, deal2.token, 'EARLYGAP', { ...BUYER, buyer_phone: '08070000000' });
    assert.equal(friend.status, 200);
    await assertBooksBalance(t);
  });

  test('buyer: half the fee on a 50/50 deal; nothing to remove when the seller pays it or the link is already fee-free', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const split = await createDeal(t, seller, { ...DEAL, fee_payer: 'split' });
    const r = await buyWithCode(t, split.token, 'EARLYGAP');
    assert.equal(r.accept.promo.discount, 33_800, 'the buyer’s half, rounded up to whole naira as on the link');
    const sellerPays = await createDeal(t, seller, { ...DEAL, fee_payer: 'seller' });
    assert.match((await t.post(`/api/deals/${sellerPays.token}/accept`, { promo_code: 'EARLYGAP' })).data.error, /seller pays the TrustGap fee/);
    const freeLink = await createDeal(t, seller, { ...DEAL, promo_code: 'EARLYGAP' });
    assert.match((await t.post(`/api/deals/${freeLink.token}/accept`, { promo_code: 'EARLYGAP' })).data.error, /already has no TrustGap fee/);
    await assertBooksBalance(t);
  });
});
