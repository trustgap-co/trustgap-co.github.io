import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { boot, onboardSeller, createDeal, buyerCheckout, completePayment, DEAL, BUYER } from './helpers.js';
import { normaliseState } from '../src/lib/states.js';
import { mapFezStatus, parseFezExpiry } from '../src/providers/logistics/fez.js';

let realFetch;
beforeEach(() => (realFetch = globalThis.fetch));
afterEach(() => (globalThis.fetch = realFetch));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('states instead of fixed areas', () => {
  test('state names are read the way people type them', () => {
    assert.equal(normaliseState('lagos'), 'Lagos');
    assert.equal(normaliseState('Lagos State'), 'Lagos');
    assert.equal(normaliseState('  cross   river '), 'Cross River');
    assert.equal(normaliseState('Abuja'), 'FCT');
    assert.equal(normaliseState('Ikeja'), null);
  });

  test('the seller types both addresses and states', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const { pickup_state, ...noPickup } = DEAL;
    assert.match((await t.post('/api/seller/deals', noPickup, seller)).data.error, /state you ship from/);
    assert.match((await t.post('/api/seller/deals', { ...DEAL, delivery_state: 'Lekki' }, seller)).data.error, /buyer's state/);
    assert.match((await t.post('/api/seller/deals', { ...DEAL, delivery_address: '' }, seller)).data.error, /delivery address/);
    assert.match((await t.post('/api/seller/deals', { ...DEAL, weight_kg: 0 }, seller)).data.error, /weight/);
    const deal = await createDeal(t, seller, { ...DEAL, pickup_state: 'rivers state', delivery_state: 'Abuja', weight_kg: '2.3', fragile: 'yes' });
    assert.equal(deal.pickup_state, 'Rivers');
    assert.equal(deal.delivery_state, 'FCT');
    assert.equal(deal.weight_kg, 3, 'rounded up to whole kg, as Fez prices');
    assert.equal(deal.fragile, true);
  });

  test('the seller sees the exact delivery fee, fees, buyer total and payout before creating the link', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const lagos = (await t.post('/api/seller/quote', DEAL, seller)).data;
    const kano = (await t.post('/api/seller/quote', { ...DEAL, delivery_state: 'Kano' }, seller)).data;
    assert.equal(lagos.price.deliveryFee, 322_500);
    assert.equal(kano.price.deliveryFee, 645_000);
    assert.equal(lagos.price.buyerTotal, 4_995_700);
    const deal = await createDeal(t, seller, DEAL);
    assert.deepEqual(deal.price, lagos.price, 'the link charges exactly what the preview showed');
    assert.equal((await t.post('/api/seller/quote', DEAL)).status, 401, 'sellers only');
  });

  test('the buyer sees the address read-only in step 1 and cannot change it at payment', async () => {
    const t = boot();
    const deal = await createDeal(t, await onboardSeller(t));
    const view = (await t.get(`/api/deals/${deal.token}`)).data.deal;
    assert.deepEqual(view.delivery, { address: DEAL.delivery_address, landmark: DEAL.delivery_landmark, state: 'Lagos' });
    assert.equal(view.price.total, 4_995_700);
    assert.doesNotMatch(JSON.stringify(view), /Allen Avenue/, 'never the pickup address');

    const { checkout_id } = (await t.post(`/api/deals/${deal.token}/accept`)).data;
    const stale = await t.post(`/api/deals/${deal.token}/pay`, { ...BUYER, checkout_id, expected_total: 100 });
    assert.equal(stale.status, 409);
    const sneaky = { ...BUYER, checkout_id, expected_total: view.price.total, delivery_address: '1 Other Street, Kano', delivery_state: 'Kano' };
    assert.equal((await t.post(`/api/deals/${deal.token}/pay`, sneaky)).status, 200);
    const order = await t.one('SELECT * FROM orders');
    assert.equal(order.delivery_address, DEAL.delivery_address);
    assert.equal(order.delivery_state, 'Lagos');
    assert.equal(order.amount, 4_995_700);
  });

  test('delivery paid by the seller or split 50/50', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const bySeller = (await t.post('/api/seller/quote', { ...DEAL, delivery_state: 'Kano', delivery_payer: 'seller' }, seller)).data.price;
    assert.equal(bySeller.buyerDelivery, 0);
    assert.equal(bySeller.sellerPayout, 4_500_000 - 645_000);
    const split = (await t.post('/api/seller/quote', { ...DEAL, delivery_state: 'Kano', delivery_payer: 'split' }, seller)).data.price;
    assert.equal(split.buyerDelivery, 322_500);
    assert.equal(split.sellerDelivery, 322_500);
    assert.equal(split.sellerPayout, 4_500_000 - 322_500);
    assert.equal(split.buyerTotal - split.sellerPayout, split.deliveryFee + split.platformFee + split.processingFee);
  });
});

describe('Fez', () => {
  // No FEZ_SECRET_KEY: the secret key comes from the login reply, as in Fez's docs.
  const FEZ = { LOGISTICS_PROVIDER: 'fez', FEZ_USER_ID: 'G-123', FEZ_PASSWORD: 'pw', FEZ_API_BASE: 'https://fez.test/v1' };

  let tokenSeq = 0; // tokens stay unique across tests (the Worker caches its Fez session)

  // A small fake Fez server: records every call and lets each test set the parcel's status.
  function fakeFez() {
    const calls = [];
    const state = { status: 'Pending Pick-Up', reason: null, logins: 0, rejectToken: null };
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url: u, method: init.method, headers: init.headers, body });
      if (u.endsWith('/user/authenticate')) {
        state.logins++;
        // Shape taken from Fez's "Authenticate" docs.
        return json({
          status: 'Success',
          description: 'Login Successfull',
          authDetails: { authToken: `fez-token-${++tokenSeq}`, expireToken: '2099-01-01 00:00:00' },
          userDetails: { userID: 'G-123', 'Full Name': 'TrustGap Admin', Username: 'trustgap' },
          orgDetails: { 'secret-key': 'fez-secret', 'Org Full Name': 'TrustGap' },
        });
      }
      if (state.rejectToken && init.headers?.Authorization === `Bearer ${state.rejectToken}`) {
        return json({ status: 'Error', description: 'Unauthenticated' }, 401);
      }
      if (u.endsWith('/order/cost')) return json({ status: 'Success', cost: { state: body.state, cost: body.state === body.pickUpState ? 2500 : 6000 }, vat: { vatAmount: 187.5 }, totalCost: body.state === body.pickUpState ? 2687.5 : 6450 });
      if (u.endsWith('/order') && init.method === 'POST') return json({ status: 'Success', description: 'Order Successfully Created', orderNos: { [body[0].uniqueID]: 'FEZ123456' } }, 201);
      if (u.includes('/orders/FEZ123456')) return json({ status: 'Success', orderDetails: [{ orderNo: 'FEZ123456', orderStatus: state.status, returnReason: state.reason }] });
      if (u.endsWith('/webhooks/store')) return json({ status: 'Success', data: { webhook: body.webhook } });
      return json({ status: 'Error', description: 'unexpected ' + u }, 404);
    };
    return { calls, state };
  }

  async function paidFezOrder(t) {
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller, { ...DEAL, weight_kg: 2, fragile: 'yes' });
    const r = await buyerCheckout(t, deal.token);
    const trackToken = await completePayment(t, r.data.payment_url);
    const order = await t.one('SELECT * FROM orders');
    return { seller, deal, trackToken, order };
  }

  const sign = (orderNo, status, ts) => createHmac('sha256', 'fez-secret').update(`${orderNo}${status}${ts}`).digest('hex');
  const webhook = (t, status, { signature } = {}) => {
    const ts = String(Math.floor(Date.now() / 1000));
    return t.call('POST', '/webhooks/fez', { orderNumber: 'FEZ123456', status }, null, {
      'X-Timestamp': ts,
      'X-Signature': signature ?? sign('FEZ123456', status, ts),
    });
  };

  test('prices delivery with /order/cost (cost + VAT) and sends the right headers', async () => {
    const fez = fakeFez();
    const t = boot(FEZ);
    const seller = await onboardSeller(t);
    const q = await t.post('/api/seller/quote', { ...DEAL, delivery_state: 'Kano', weight_kg: 2 }, seller);
    assert.equal(q.data.price.deliveryFee, 645_000);
    const cost = fez.calls.find((c) => c.url.endsWith('/order/cost'));
    assert.deepEqual(cost.body, { state: 'Kano', pickUpState: 'Lagos', weight: 2 });
    assert.equal(cost.headers['secret-key'], 'fez-secret');
    assert.match(cost.headers.Authorization, /^Bearer fez-token-\d+$/);
  });

  test('booking creates the Fez order with the buyer’s details and the delivery PIN as CustToken', async () => {
    const fez = fakeFez();
    const t = boot(FEZ);
    const { seller, trackToken, order } = await paidFezOrder(t);
    const pin = (await t.get(`/api/track/${trackToken}`)).data.order.pin;
    const booked = await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box, serial 42' }, seller);
    assert.equal(booked.status, 200, JSON.stringify(booked.data));
    const create = fez.calls.find((c) => c.url.endsWith('/order') && c.method === 'POST').body;
    assert.equal(create.length, 1);
    assert.equal(create[0].uniqueID, order.ref);
    assert.equal(create[0].CustToken, pin);
    assert.equal(create[0].recipientState, 'Lagos');
    assert.equal(create[0].recipientAddress, DEAL.delivery_address);
    assert.equal(create[0].pickUpState, 'Lagos');
    assert.equal(create[0].weight, 2);
    assert.equal(create[0].fragile, true);
    assert.equal(create[0].thirdparty, 'true');
    assert.equal(create[0].senderName, 'Bayo Kicks');
    assert.equal(create[0].valueOfItem, '45000');
    const saved = await t.one('SELECT delivery_ref, courier, rider_url FROM orders');
    assert.deepEqual({ ...saved }, { delivery_ref: 'FEZ123456', courier: 'fez', rider_url: null });
  });

  test('status webhooks are re-checked with Fez; Delivered starts the inspection window', async () => {
    const fez = fakeFez();
    const t = boot(FEZ);
    const { seller, order } = await paidFezOrder(t);
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box' }, seller);

    // A forged webhook claiming "Delivered" changes nothing: Fez itself still says Dispatched.
    fez.state.status = 'Dispatched';
    await webhook(t, 'Delivered', { signature: 'forged' });
    let o = await t.one('SELECT * FROM orders');
    assert.equal(o.status, 'shipping');
    assert.equal(o.delivery_status, 'out_for_delivery');
    assert.equal(o.courier_status, 'Dispatched');

    fez.state.status = 'Delivered';
    await webhook(t, 'Delivered');
    o = await t.one('SELECT * FROM orders');
    assert.equal(o.status, 'delivered');
    assert.ok(o.inspection_ends_at);
    const events = (await t.db('SELECT type FROM order_events WHERE order_id = ?', o.id)).map((e) => e.type);
    assert.ok(events.includes('delivered_by_courier'));
  });

  test('the timers catch up a missed webhook, and a returned parcel opens a dispute', async () => {
    const fez = fakeFez();
    const t = boot(FEZ);
    const { seller, order } = await paidFezOrder(t);
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box' }, seller);
    fez.state.status = 'Picked-Up';
    await t.scheduled();
    assert.equal((await t.one('SELECT delivery_status FROM orders')).delivery_status, 'picked_up');
    fez.state.status = 'Returned';
    fez.state.reason = 'Recipient unreachable';
    await t.scheduled();
    const o = await t.one('SELECT * FROM orders');
    assert.equal(o.status, 'disputed');
    const d = await t.one('SELECT * FROM disputes');
    assert.equal(d.category, 'returned_by_courier');
    assert.match(d.description, /Recipient unreachable/);
  });

  test('admin can register the webhook with Fez', async () => {
    const fez = fakeFez();
    const t = boot(FEZ);
    const admin = (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
    const r = await t.post('/api/admin/courier/register-webhook', {}, admin);
    assert.equal(r.data.registered, 'https://api.test/webhooks/fez');
    assert.deepEqual(fez.calls.find((c) => c.url.endsWith('/webhooks/store')).body, { webhook: 'https://api.test/webhooks/fez' });
  });

  test('logs in with user_id/password, takes the secret key from the reply, and re-logs in when a token is refused', async () => {
    const fez = fakeFez();
    const t = boot(FEZ);
    const seller = await onboardSeller(t);
    const quote = () => t.post('/api/seller/quote', { ...DEAL, delivery_state: 'Kano' }, seller);

    assert.equal((await quote()).status, 200);
    const firstCost = fez.calls.filter((c) => c.url.endsWith('/order/cost')).at(-1);
    assert.equal(firstCost.headers['secret-key'], 'fez-secret');
    const usedToken = firstCost.headers.Authorization.replace('Bearer ', '');

    // Fez stops accepting that token (e.g. it expired early): one fresh login, then the call succeeds.
    fez.state.rejectToken = usedToken;
    const loginsBefore = fez.state.logins;
    const r = await quote();
    assert.equal(r.status, 200);
    assert.equal(fez.state.logins, loginsBefore + 1);
    const login = fez.calls.filter((c) => c.url.endsWith('/user/authenticate')).at(-1);
    assert.deepEqual(login.body, { user_id: 'G-123', password: 'pw' });
    assert.notEqual(fez.calls.filter((c) => c.url.endsWith('/order/cost')).at(-1).headers.Authorization, `Bearer ${usedToken}`);
  });

  test('token expiry is read as Lagos time', () => {
    assert.equal(parseFezExpiry('2023-01-27 05:06:08'), Date.parse('2023-01-27T04:06:08Z'));
    assert.ok(Number.isNaN(parseFezExpiry('')));
  });

  test('Fez statuses map to delivery stages', () => {
    assert.equal(mapFezStatus('Pending Pick-Up'), 'booked');
    assert.equal(mapFezStatus('Pending Payment'), 'awaiting_payment');
    assert.equal(mapFezStatus('Picked-Up'), 'picked_up');
    assert.equal(mapFezStatus('Dispatched'), 'out_for_delivery');
    assert.equal(mapFezStatus('Delivered'), 'delivered');
    assert.equal(mapFezStatus('Returned'), 'returned');
    assert.equal(mapFezStatus('Failed Pick-Up'), 'problem');
    assert.equal(mapFezStatus('Rejected At Drop-off'), 'problem');
  });
});
