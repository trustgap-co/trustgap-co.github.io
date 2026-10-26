import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, login, createDeal, buyerCheckout, completePayment, buyerPays, SELLER, DEAL, BUYER, PHOTO } from './helpers.js';

const lastOrder = (t) => t.one('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
const ledgerOf = async (t, orderId) =>
  Object.fromEntries((await t.db('SELECT kind, amount, status FROM ledger WHERE order_id = ?', orderId)).map((l) => [l.kind, l]));

async function adminToken(t) {
  return (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
}

async function riderToken(t, orderId) {
  const order = await t.one('SELECT rider_url FROM orders WHERE id = ?', orderId);
  return new URL(order.rider_url).searchParams.get('t');
}

async function shipAndDeliver(t, sellerToken, order, pin) {
  await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box, receipt inside, size tag 42' }, sellerToken);
  const rt = await riderToken(t, order.id);
  await t.post(`/api/rider/${rt}/status`, { status: 'picked_up' });
  await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
  return { rt, res: await t.post(`/api/rider/${rt}/pin`, { pin }) };
}

describe('happy path', () => {
  test('link → review → pay → ship → PIN → buyer confirms → seller paid', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    assert.equal(deal.price.platformFee, 67_500); // TrustGap fee 1.5%
    assert.equal(deal.pickup_state, 'Lagos');
    assert.equal(deal.price.sellerPayout, 4_500_000);

    // Step 1: the buyer sees the whole deal but never the pickup address.
    const view = await t.get(`/api/deals/${deal.token}`);
    assert.equal(view.data.deal.price.item, 4_500_000);
    assert.equal(view.data.deal.price.platform_fee, 67_500);
    assert.equal(view.data.deal.ships_from, 'Lagos');
    assert.equal(view.data.deal.seller.identity_verified, true);
    assert.doesNotMatch(JSON.stringify(view.data), /Allen Avenue/);

    const { trackToken, track } = await buyerPays(t, deal.token);
    assert.equal(track.order.status, 'paid');
    // Lagos → Lagos: ₦3,000 + 7.5% VAT delivery, processing recalculated on the real total.
    assert.deepEqual(track.order.price, { item: 4_500_000, delivery: 322_500, platform_fee: 67_500, processing_fee: 105_700, promo_discount: 0, total: 4_995_700 });
    assert.match(track.order.pin, /^\d{4}$/);
    assert.equal((await t.get(`/api/deals/${deal.token}`)).data.deal.status, 'paid');

    // Seller sees the order, but not the buyer's refund account or address.
    const order = await lastOrder(t);
    const sellerView = await t.get(`/api/seller/orders/${order.id}`, seller);
    assert.doesNotMatch(JSON.stringify(sellerView.data), /0000000002|Admiralty|refund/);

    const wrongPin = track.order.pin === '0000' ? '1111' : '0000';
    const { rt, res: wrong } = await shipAndDeliver(t, seller, order, wrongPin);
    assert.equal(wrong.status, 400);
    assert.match(wrong.data.error, /Wrong PIN/);
    const rider = await t.get(`/api/rider/${rt}`);
    assert.match(rider.data.order.dropoff.address, /Admiralty Way/);
    assert.equal((await t.post(`/api/rider/${rt}/pin`, { pin: track.order.pin })).status, 200);
    assert.equal((await lastOrder(t)).status, 'delivered');

    await t.post(`/api/track/${trackToken}/accept`);
    assert.equal((await lastOrder(t)).status, 'completed');
    let l = await ledgerOf(t, order.id);
    assert.equal(l.collected.amount, 4_995_700);
    assert.equal(l.seller_payout.amount, 4_500_000);
    // Flutterwave settles T+1, so the payout waits for the buyer's money to arrive in the wallet.
    assert.equal(l.seller_payout.status, 'pending');
    t.advanceHours(24 * 4);
    await t.scheduled();
    l = await ledgerOf(t, order.id);
    assert.equal(l.seller_payout.status, 'success');
    assert.equal(l.platform_fee.amount, 67_500);
    assert.equal(l.processing_fee.amount, 105_700);
    assert.equal(l.delivery_cost.amount, 322_500);

    const sms = (await t.db('SELECT sms FROM outbox')).map((m) => m.sms).join('\n');
    assert.match(sms, /Your TrustGap code is \d{6}/);
    assert.match(sms, /Your delivery PIN is \d{4}/);
    assert.match(sms, /released to your/);
  });
});

describe('seller sign-in and verification', () => {
  test('SMS code: wrong code, limits and unknown numbers', async () => {
    const t = boot();
    const s = await t.post('/api/auth/signup', SELLER);
    const wrong = await t.post('/api/auth/verify', { phone: SELLER.phone, code: s.data.dev_code === '000000' ? '111111' : '000000' });
    assert.match(wrong.data.error, /Wrong code\. 4 attempt/);
    const ok = await t.post('/api/auth/verify', { phone: SELLER.phone, code: s.data.dev_code });
    assert.ok(ok.data.token);
    const reuse = await t.post('/api/auth/verify', { phone: SELLER.phone, code: s.data.dev_code });
    assert.equal(reuse.status, 400);

    await t.post('/api/auth/login', { phone: SELLER.phone });
    await t.post('/api/auth/login', { phone: SELLER.phone });
    const limited = await t.post('/api/auth/login', { phone: SELLER.phone });
    assert.equal(limited.status, 429);

    assert.equal((await t.post('/api/auth/login', { phone: '08099999999' })).status, 404);
    assert.equal((await t.post('/api/auth/signup', SELLER)).status, 400);
    assert.equal((await t.get('/api/seller/me')).status, 401);
  });

  test('identity must match the seller’s name and date of birth', async () => {
    const t = boot();
    const token = await onboardSeller(t, SELLER, { identity: false });
    const blocked = await t.post('/api/seller/deals', DEAL, token);
    assert.match(blocked.data.error, /Verify your identity/);

    const otherPerson = await t.post('/api/seller/identity', { id_type: 'nin', id_number: '22222222222', dob: '1994-06-02' }, token);
    assert.match(otherPerson.data.error, /different name/);
    const wrongDob = await t.post('/api/seller/identity', { id_type: 'nin', id_number: '11111111111', dob: '1991-01-15' }, token);
    assert.match(wrongDob.data.error, /date of birth/);
    const ok = await t.post('/api/seller/identity', { id_type: 'nin', id_number: '11111111111', dob: '1990-01-15' }, token);
    assert.equal(ok.data.seller.identity_verified, true);
    assert.equal((await t.one('SELECT id_last4 FROM sellers')).id_last4, '1111');
  });

  test('payout account must be in the seller’s own name', async () => {
    const t = boot();
    const token = await onboardSeller(t, SELLER, { identity: false });
    const r = await t.post('/api/seller/payout', { bank_code: '058', account_number: '0000000003' }, token);
    assert.match(r.data.error, /MUSA IBRAHIM BELLO/);
  });
});

describe('checkout safeguards', () => {
  test('refund account must be in the buyer’s own name', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t));
    const r = await buyerCheckout(t, deal.token, { ...BUYER, refund_account_number: '0000000003' });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /MUSA IBRAHIM BELLO/);
    assert.equal(await lastOrder(t), null);
  });

  test('step 2 needs a confirmed step 1', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t));
    const r = await t.post(`/api/deals/${deal.token}/pay`, { ...BUYER, checkout_id: 'forged' });
    assert.equal(r.status, 409);
  });

  test('links expire', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t), { ...DEAL, expires_hours: 1 });
    t.advanceHours(2);
    assert.equal((await t.get(`/api/deals/${deal.token}`)).data.deal.status, 'expired');
    assert.equal((await t.post(`/api/deals/${deal.token}/accept`)).status, 410);
  });

  test('failed payment can be retried', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t));
    const { trackToken, track } = await buyerPays(t, deal.token, BUYER, 'failed');
    assert.equal(track.order.status, 'awaiting_payment');
    assert.equal(track.order.can_retry_payment, true);
    const retry = await t.post(`/api/track/${trackToken}/retry`);
    await completePayment(t, retry.data.payment_url);
    assert.equal((await t.get(`/api/track/${trackToken}`)).data.order.status, 'paid');
  });
});

describe('money safety under races', () => {
  test('two payment pages open at once: the second payment is refunded in full', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t));
    const a = await buyerCheckout(t, deal.token);
    await buyerPays(t, deal.token, { ...BUYER, buyer_name: 'Emeka Nwosu', refund_account_number: '0000000005' });
    const aTrack = await completePayment(t, a.data.payment_url);
    const view = await t.get(`/api/track/${aTrack}`);
    assert.equal(view.data.order.status, 'duplicate_refunded');
    const orderA = await t.one('SELECT * FROM orders WHERE buyer_token = ?', aTrack);
    assert.equal((await ledgerOf(t, orderA.id)).buyer_refund.amount, orderA.amount);
  });

  test('callback and webhook confirming the same payment at once record it only once', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t));
    const checkout = await buyerCheckout(t, deal.token);
    const txRef = decodeURIComponent(new URL(checkout.data.payment_url).pathname.split('/').pop());
    await t.env.DB.prepare("UPDATE mock_transactions SET status = 'successful' WHERE tx_ref = ?").bind(txRef).run();
    await Promise.all([1, 2, 3].map(() => t.get(`/api/payments/callback?tx_ref=${txRef}`)));
    const order = await lastOrder(t);
    assert.equal(order.status, 'paid');
    assert.equal((await t.db("SELECT * FROM ledger WHERE kind = 'collected'")).length, 1);
    assert.equal((await t.db("SELECT * FROM outbox WHERE event = 'payment_received_buyer'")).length, 1);
  });

  test('buyer confirming and the auto-release timer at once pay the seller once', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken, track } = await buyerPays(t, deal.token);
    await shipAndDeliver(t, seller, await lastOrder(t), track.order.pin);
    t.advanceHours(25);
    await Promise.all([t.post(`/api/track/${trackToken}/accept`), t.scheduled()]);
    assert.equal((await t.db("SELECT * FROM ledger WHERE kind = 'seller_payout'")).length, 1);
  });
});

describe('timers', () => {
  test('payment is auto-released after the inspection window', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { track } = await buyerPays(t, deal.token);
    await shipAndDeliver(t, seller, await lastOrder(t), track.order.pin);
    t.advanceHours(23);
    await t.scheduled();
    assert.equal((await lastOrder(t)).status, 'delivered');
    t.advanceHours(2);
    await t.scheduled();
    assert.equal((await lastOrder(t)).status, 'completed');
  });

  test('a seller who misses the ship-by date triggers a dispute', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t), { ...DEAL, delivery_days: 1 });
    await buyerPays(t, deal.token);
    t.advanceHours(25);
    await t.scheduled();
    const order = await lastOrder(t);
    assert.equal(order.status, 'disputed');
    assert.equal((await t.one('SELECT category FROM disputes')).category, 'not_shipped');
  });

  test('abandoned checkouts are cancelled', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t));
    await buyerCheckout(t, deal.token);
    t.advanceHours(3);
    await t.scheduled();
    assert.equal((await lastOrder(t)).status, 'cancelled');
  });
});

describe('disputes', () => {
  test('refused at the door → admin refunds buyer and charges seller', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    await buyerPays(t, deal.token);
    let order = await lastOrder(t);
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue sneakers size 42' }, seller);
    const rt = await riderToken(t, order.id);
    await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
    await t.post(`/api/rider/${rt}/status`, { status: 'refused', note: 'Buyer says it is size 40, not 42' });
    order = await lastOrder(t);
    assert.equal(order.status, 'disputed');
    const dispute = await t.one('SELECT * FROM disputes');
    assert.equal(dispute.category, 'refused_at_door');

    const admin = await adminToken(t);
    const tooMuch = await t.post(`/api/admin/disputes/${dispute.id}/resolve`,
      { buyer_refund: '49957', seller_payout: '1', seller_charge: '0', note: 'Testing the limit check here' }, admin);
    assert.match(tooMuch.data.error, /cannot exceed/);
    await t.post(`/api/admin/disputes/${dispute.id}/resolve`,
      { buyer_refund: '49957', seller_payout: '0', seller_charge: '7000', note: 'Rider photo shows size 40. Seller sent the wrong size.' }, admin);
    assert.equal((await lastOrder(t)).status, 'refunded');
    assert.equal((await ledgerOf(t, order.id)).buyer_refund.amount, 4_995_700);
    assert.equal((await t.one('SELECT amount_owed FROM sellers')).amount_owed, 700_000);

    const blocked = await t.post('/api/seller/deals', DEAL, seller);
    assert.match(blocked.data.error, /You owe ₦7,000/);
  });

  test('a disputed order is never auto-released', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken, track } = await buyerPays(t, deal.token);
    await shipAndDeliver(t, seller, await lastOrder(t), track.order.pin);
    await t.post(`/api/track/${trackToken}/dispute`, { category: 'counterfeit', description: 'No serial tag, stitching looks fake', photos: [PHOTO] });
    t.advanceHours(48);
    await t.scheduled();
    assert.equal((await lastOrder(t)).status, 'disputed');
  });
});

describe('access control', () => {
  test('admin endpoints need an admin session; repeated wrong passwords lock out', async () => {
    const t = boot();
    assert.equal((await t.get('/api/admin/orders')).status, 401);
    const seller = await onboardSeller(t);
    assert.equal((await t.get('/api/admin/orders', seller)).status, 401);
    for (let i = 0; i < 10; i++) await t.post('/api/admin/login', { password: 'guess' + i });
    assert.equal((await t.post('/api/admin/login', { password: 'test-admin-password' })).status, 429);
  });

  test('tampered rider links are rejected', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    await buyerPays(t, deal.token);
    const order = await lastOrder(t);
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box' }, seller);
    const rt = await riderToken(t, order.id);
    const forged = rt.replace(/^rider-\d+/, 'rider-999');
    assert.equal((await t.get(`/api/rider/${forged}`)).status, 404);
    t.advanceHours(24 * 15);
    assert.equal((await t.get(`/api/rider/${rt}`)).status, 404, 'rider links expire');
  });

  test('CORS only allows the configured site', async () => {
    const t = boot();
    const ok = await t.get('/api/config');
    assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://site.test');
    const other = await t.call('GET', '/api/config', null, null, { Origin: 'https://evil.test' });
    assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  });

  test('a session token stops working after logout', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    assert.equal((await t.get('/api/seller/me', seller)).status, 200);
    await t.post('/api/auth/logout', {}, seller);
    assert.equal((await t.get('/api/seller/me', seller)).status, 401);
    assert.ok(await login(t));
  });
});

describe('addresses', () => {
  test('a doubled slash from a trailing slash in config.js still reaches the API', async () => {
    const t = boot();
    const res = await t.call('POST', 'https://api.test//api/admin/login', { password: 'test-admin-password' });
    assert.equal(res.status, 200);
    assert.ok(res.data.token);
  });
});

describe('health check', () => {
  test('reports the database state', async () => {
    const t = boot();
    assert.deepEqual((await t.get('/api/health')).data, { ok: true, database: 'connected' });
    await t.env.DB.prepare('DROP TABLE meta').run();
    assert.match((await t.get('/api/health')).data.database, /Tables missing: meta/);
    const noDb = boot();
    delete noDb.env.DB;
    assert.match((await noDb.get('/api/health')).data.database, /No D1 binding called DB/);
  });
});
