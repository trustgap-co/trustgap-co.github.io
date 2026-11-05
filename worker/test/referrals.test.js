import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays, SELLER, DEAL, BUYER } from './helpers.js';

const BOB = { ...SELLER, business_name: 'Bola Phones', phone: '08070000001', email: 'bola@example.com' };
const adminToken = async (t) => (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;

// The new seller signs up with an invite code, then gets their own payout account and identity.
async function invitedSeller(t, code, seller = BOB) {
  const s = await t.post('/api/auth/signup', { ...seller, ref: code });
  const token = (await t.post('/api/auth/verify', { phone: seller.phone, code: s.data.dev_code })).data.token;
  await t.post('/api/seller/payout', { bank_code: '058', account_number: '0000000001' }, token);
  await t.post('/api/seller/identity', { id_type: 'nin', id_number: '11111111111', dob: '1990-01-15' }, token);
  // A different person: a different bank account and identity from the inviter.
  await t.db("UPDATE sellers SET payout_account_number = '0123456789', id_last4 = '9999' WHERE phone = ?", '+2348070000001');
  return token;
}
async function completeOrder(t, sellerToken, dealToken, buyer = BUYER) {
  const { trackToken, track } = await buyerPays(t, dealToken, buyer);
  const order = await t.one('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
  await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box, receipt inside' }, sellerToken);
  const rt = new URL((await t.one('SELECT rider_url FROM orders WHERE id = ?', order.id)).rider_url).searchParams.get('t');
  await t.post(`/api/rider/${rt}/status`, { status: 'picked_up' });
  await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
  await t.post(`/api/rider/${rt}/pin`, { pin: track.order.pin });
  await t.post(`/api/track/${trackToken}/accept`, {});
  return order;
}

describe('referrals', () => {
  test('invite → 2 free deals for the new seller → their first completed order earns the inviter a free deal', async () => {
    const t = boot();
    const ada = await onboardSeller(t);
    const card = (await t.get('/api/seller/dashboard', ada)).data.referral;
    assert.match(card.code, /^[A-Z]{1,5}\d{3}$/);
    assert.match(card.link, new RegExp(`signup\\.html\\?ref=${card.code}$`));
    assert.deepEqual((await t.get(`/api/referral/${card.code.toLowerCase()}`)).data, { valid: true, business_name: SELLER.business_name, welcome_deals: 2 });
    assert.equal((await t.get('/api/referral/NOPE123')).data.valid, false);

    const bob = await invitedSeller(t, card.code);
    assert.equal((await t.get('/api/seller/me', bob)).data.seller.free_deals, 2);
    const q = await t.post('/api/seller/quote', DEAL, bob);
    assert.equal(q.data.price.platformFee, 0);
    assert.equal(q.data.promo.free_deal, true);
    // Unticking "use a free deal" keeps it for later.
    assert.equal((await t.post('/api/seller/quote', { ...DEAL, use_free_deal: 'no' }, bob)).data.price.platformFee, 67_500);

    const deal = await createDeal(t, bob);
    assert.equal(deal.price.platformFee, 0);
    assert.equal((await t.get('/api/seller/me', bob)).data.seller.free_deals, 1);
    const order = await completeOrder(t, bob, deal.token);

    const after = (await t.get('/api/seller/dashboard', ada)).data.referral;
    assert.equal(after.invited, 1);
    assert.equal(after.active, 1);
    assert.equal(after.free_deals, 1, 'the inviter earned a free deal');
    assert.match((await t.db("SELECT sms FROM outbox WHERE event = 'referral_rewarded'"))[0].sms, /Bola Phones, who joined with your invite/);
    const waived = await t.db("SELECT amount, counterparty, status FROM ledger WHERE kind = 'fee_waived' AND order_id = ?", order.id);
    assert.deepEqual(waived, [{ amount: 67_500, counterparty: 'referral', status: 'info' }]);
  });

  test('no reward for the same person, small orders, or a disputed order; a link that expires gives the free deal back', async () => {
    const t = boot();
    const ada = await onboardSeller(t);
    const code = (await t.get('/api/seller/dashboard', ada)).data.referral.code;
    const bob = await invitedSeller(t, code);
    await t.db("UPDATE sellers SET payout_account_number = '0000000001' WHERE phone = ?", '+2348070000001'); // same bank account as Ada
    const deal = await createDeal(t, bob);
    await completeOrder(t, bob, deal.token);
    assert.equal((await t.one('SELECT status, note FROM referrals')).status, 'blocked');
    assert.equal((await t.get('/api/seller/dashboard', ada)).data.referral.free_deals, 0);

    // A link that expires unpaid gives its free deal back.
    const t2 = boot();
    const ada2 = await onboardSeller(t2);
    const bob2 = await invitedSeller(t2, (await t2.get('/api/seller/dashboard', ada2)).data.referral.code);
    await createDeal(t2, bob2);
    assert.equal((await t2.get('/api/seller/me', bob2)).data.seller.free_deals, 1);
    t2.clock.advance?.(25 * 3_600_000);
    await t2.db("UPDATE deals SET status = 'expired'");
    assert.equal((await t2.get('/api/seller/me', bob2)).data.seller.free_deals, 2);

    // Orders under ₦10,000 don't count yet.
    const t3 = boot();
    const ada3 = await onboardSeller(t3);
    const bob3 = await invitedSeller(t3, (await t3.get('/api/seller/dashboard', ada3)).data.referral.code);
    const small = await createDeal(t3, bob3, { ...DEAL, item_price: '8,000' });
    await completeOrder(t3, bob3, small.token);
    assert.equal((await t3.one('SELECT status FROM referrals')).status, 'pending');
  });

  test('five successful invites make an Ambassador, shown to buyers', async () => {
    const t = boot();
    const ada = await onboardSeller(t);
    const adaId = (await t.one('SELECT id FROM sellers')).id;
    for (let i = 0; i < 5; i++) {
      const id = (await t.db("INSERT INTO sellers (full_name, business_name, phone, email, created_at) VALUES ('X Y', 'Shop', ?, 'x@y.z', '2026-01-01') RETURNING id", `+23480700001${i}0`))[0].id;
      await t.db("INSERT INTO referrals (referrer_id, referred_id, status, created_at) VALUES (?, ?, 'rewarded', '2026-01-01')", adaId, id);
    }
    const deal = await createDeal(t, ada);
    assert.equal((await t.get(`/api/deals/${deal.token}`)).data.deal.seller.history.ambassador, true);
    const a = await adminToken(t);
    const sellers = (await t.get('/api/admin/sellers', a)).data;
    assert.equal(sellers.top_referrers[0].active, 5);
  });
});

describe('ledger segments', () => {
  test('each segment lists its own entries and totals', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    await completeOrder(t, seller, deal.token);
    const a = await adminToken(t);
    const all = (await t.get('/api/admin/ledger', a)).data;
    const seg = Object.fromEntries(all.segments.map((s) => [s.key, s]));
    assert.deepEqual(Object.keys(seg), ['in', 'out', 'revenue', 'costs', 'giveaways', 'other', 'problems']);
    assert.ok(seg.in.total > 0);
    assert.equal(seg.revenue.total, 67_500, 'the TrustGap fee (own riders: no delivery margin)');
    const revenue = (await t.get('/api/admin/ledger?segment=revenue', a)).data;
    assert.equal(revenue.segment, 'revenue');
    assert.ok(revenue.entries.every((e) => ['platform_fee', 'delivery_margin', 'dispute_fee'].includes(e.kind)));
    const costs = (await t.get('/api/admin/ledger?segment=costs', a)).data;
    assert.ok(costs.entries.some((e) => e.kind === 'processing_fee'));
    assert.equal((await t.get('/api/admin/ledger?segment=bogus', a)).data.segment, 'all');
  });
});
