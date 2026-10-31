import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, completePayment, DEAL, BUYER } from './helpers.js';
import { TOS_VERSION } from '../src/lib/terms.js';

describe('confirmations before a deal', () => {
  test('the seller must confirm the item’s condition; the exact wording is stored with the link', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const { condition_confirmed, ...unconfirmed } = DEAL;
    assert.match((await t.post('/api/seller/deals', unconfirmed, seller)).data.error, /good condition/);
    await createDeal(t, seller);
    const d = await t.one('SELECT condition_confirmed_at, condition_pledge FROM deals');
    assert.ok(d.condition_confirmed_at);
    assert.match(d.condition_pledge, /twice the delivery fee \(₦6,450\)/, '2 × ₦3,225 Lagos delivery');
    const cfg = (await t.get('/api/config')).data;
    assert.match(cfg.consents.seller.confirm, /good condition as agreed/);
  });

  test('the buyer must accept the change-of-mind notice before paying; it is part of the accepted terms', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t));
    const total = (await t.get(`/api/deals/${deal.token}`)).data.deal.price.total;
    const noAck = (await t.post(`/api/deals/${deal.token}/accept`, {})).data;
    const refused = await t.post(`/api/deals/${deal.token}/pay`, { ...BUYER, checkout_id: noAck.checkout_id, expected_total: total });
    assert.equal(refused.status, 409);
    assert.match(refused.data.error, /change your mind/);
    const ack = (await t.post(`/api/deals/${deal.token}/accept`, { penalty_acknowledged: true, terms_accepted: true })).data;
    const pay = await t.post(`/api/deals/${deal.token}/pay`, { ...BUYER, checkout_id: ack.checkout_id, expected_total: total, marketing_opt_in: true });
    assert.equal(pay.status, 200);
    const o = await t.one('SELECT terms_json, buyer_ack_at, buyer_marketing_opt_in_at FROM orders');
    const terms = JSON.parse(o.terms_json);
    assert.match(terms.buyer_acknowledgement.text, /change your mind after paying.*₦6,450/);
    assert.equal(o.buyer_ack_at, terms.buyer_acknowledgement.at);
    assert.ok(o.buyer_marketing_opt_in_at, 'opted in to news and offers');
  });

  test('sellers must accept the Terms of Service to sign up; the time and version are stored', async () => {
    const t = boot();
    const form = { full_name: 'Adebayo Oluwaseun John', business_name: 'Bayo', phone: '08031234567', email: 'b@x.ng' };
    for (const terms_accepted of [undefined, false, 'no']) {
      const r = await t.post('/api/auth/signup', { ...form, terms_accepted });
      assert.equal(r.status, 400);
      assert.match(r.data.error, /Terms of Service/);
    }
    assert.equal((await t.one('SELECT COUNT(*) n FROM sellers')).n, 0, 'no account without acceptance');
    assert.equal((await t.post('/api/auth/signup', { ...form, terms_accepted: 'yes' })).status, 200);
    const s = await t.one('SELECT terms_accepted_at, terms_version FROM sellers');
    assert.ok(s.terms_accepted_at);
    assert.equal(s.terms_version, TOS_VERSION);
  });

  test('buyers must accept the Terms of Service in step 1 before paying', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t));
    const total = (await t.get(`/api/deals/${deal.token}`)).data.deal.price.total;
    const noTerms = (await t.post(`/api/deals/${deal.token}/accept`, { penalty_acknowledged: true })).data;
    const refused = await t.post(`/api/deals/${deal.token}/pay`, { ...BUYER, checkout_id: noTerms.checkout_id, expected_total: total });
    assert.equal(refused.status, 409);
    assert.match(refused.data.error, /Terms of Service/);
    const ok = (await t.post(`/api/deals/${deal.token}/accept`, { penalty_acknowledged: true, terms_accepted: true })).data;
    assert.equal((await t.post(`/api/deals/${deal.token}/pay`, { ...BUYER, checkout_id: ok.checkout_id, expected_total: total })).status, 200);
    const o = await t.one('SELECT terms_json, buyer_terms_accepted_at FROM orders');
    const tos = JSON.parse(o.terms_json).terms_of_service;
    assert.equal(tos.version, TOS_VERSION);
    assert.ok(tos.documents.includes('legal/terms.html'));
    assert.equal(o.buyer_terms_accepted_at, tos.at);
  });
});

describe('paying a dispute charge straight away', () => {
  async function owingSeller(t, owed = 645_000) {
    const token = await onboardSeller(t);
    await t.db('UPDATE sellers SET amount_owed = ?', owed);
    return token;
  }
  const finishPayment = async (t, paymentUrl, result) => {
    const back = await t.post(new URL(paymentUrl).pathname, { result });
    return t.get(back.headers.get('Location'));
  };

  test('the seller pays on the payment page and the balance clears, exactly once', async () => {
    const t = boot();
    const seller = await owingSeller(t);
    assert.match((await t.post('/api/seller/deals', DEAL, seller)).data.error, /You owe ₦6,450/);
    const start = (await t.post('/api/seller/debt/pay', {}, seller)).data;
    assert.equal(start.amount, 645_000);
    const done = await finishPayment(t, start.payment_url, 'successful');
    assert.match(done.headers.get('Location'), /seller\/dashboard\.html\?debt=paid$/);
    assert.equal((await t.get('/api/seller/me', seller)).data.seller.amount_owed, 0);
    const again = await t.get(`/api/payments/callback?tx_ref=${(await t.one('SELECT tx_ref FROM debt_payments')).tx_ref}`);
    assert.match(again.headers.get('Location'), /debt=paid/);
    assert.equal((await t.one('SELECT amount_owed FROM sellers')).amount_owed, 0, 'not taken off twice');
    assert.equal((await t.one("SELECT COUNT(*) AS n FROM outbox WHERE event = 'debt_paid'")).n, 1);
    assert.ok((await createDeal(t, seller)).id, 'can create links again');
    assert.match((await t.post('/api/seller/debt/pay', {}, seller)).data.error, /don’t owe/);
  });

  test('a failed payment leaves the balance as it was', async () => {
    const t = boot();
    const seller = await owingSeller(t);
    const start = (await t.post('/api/seller/debt/pay', {}, seller)).data;
    const done = await finishPayment(t, start.payment_url, 'failed');
    assert.match(done.headers.get('Location'), /debt=not-paid/);
    assert.equal((await t.one('SELECT amount_owed FROM sellers')).amount_owed, 645_000);
    assert.equal((await t.one('SELECT status FROM debt_payments')).status, 'failed');
  });

  test('sellers can switch TrustGap news and offers on and off', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    assert.equal((await t.get('/api/seller/me', seller)).data.seller.marketing_opt_in, false);
    await t.post('/api/seller/marketing', { opt_in: true }, seller);
    assert.equal((await t.get('/api/seller/me', seller)).data.seller.marketing_opt_in, true);
    await t.post('/api/seller/marketing', { opt_in: false }, seller);
    assert.equal((await t.get('/api/seller/me', seller)).data.seller.marketing_opt_in, false);
  });
});
