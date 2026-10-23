import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays, SELLER } from './helpers.js';
import { createContext } from '../src/context.js';
import { sendTransfer, settleTransfer } from '../src/core/orders.js';

let realFetch;
beforeEach(() => (realFetch = globalThis.fetch));
afterEach(() => (globalThis.fetch = realFetch));
const ok = (data) => new Response(JSON.stringify({ status: 'success', data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const fwError = (status, message) => new Response(JSON.stringify({ status: 'error', message }), { status, headers: { 'Content-Type': 'application/json' } });

// A pending seller payout row, already due, on a Flutterwave-configured Worker.
async function payoutRow(t) {
  const deal = await createDeal(t, await onboardSeller(t));
  await buyerPays(t, deal.token);
  const order = await t.one('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
  await t.env.DB.prepare(
    "INSERT INTO ledger (order_id, kind, amount, counterparty, status, not_before, created_at) VALUES (?, 'seller_payout', 4500000, 'seller', 'pending', NULL, ?)",
  ).bind(order.id, new Date().toISOString()).run();
  return (await t.one("SELECT id FROM ledger WHERE kind = 'seller_payout'")).id;
}

function flutterwaveCtx(t) {
  t.env.PAYMENT_PROVIDER = 'flutterwave';
  t.env.FLW_SECRET_KEY = 'FLWSECK_TEST-abc';
  t.env.FLW_WEBHOOK_HASH = 'hook-secret';
  return createContext(t.env, { waitUntil: () => {} });
}

describe('payouts never go out twice', () => {
  test('a timed-out transfer is retried with the SAME reference; Flutterwave’s duplicate answer is not a failure', async () => {
    const t = boot();
    const id = await payoutRow(t);
    const ctx = flutterwaveCtx(t);
    const refs = [];
    let call = 0;
    globalThis.fetch = async (url, init) => {
      refs.push(JSON.parse(init.body).reference);
      call++;
      if (call === 1) throw new Error('socket hang up'); // we don't know if it went through
      return fwError(400, 'Transfer with this reference already exists'); // it had
    };
    assert.equal((await sendTransfer(ctx, id)).status, 'unknown');
    assert.equal((await sendTransfer(ctx, id)).status, 'submitted');
    assert.deepEqual(refs, [`TGT-${id}-1`, `TGT-${id}-1`]);
  });

  test('a confirmed failure retries with a new reference, then needs admin after 3 attempts', async () => {
    const t = boot();
    const id = await payoutRow(t);
    const ctx = flutterwaveCtx(t);
    const refs = [];
    globalThis.fetch = async (url, init) => {
      refs.push(JSON.parse(init.body).reference);
      return fwError(400, 'Insufficient balance');
    };
    assert.equal((await sendTransfer(ctx, id)).status, 'failed');
    assert.equal((await sendTransfer(ctx, id)).status, 'failed');
    assert.equal((await sendTransfer(ctx, id)).status, 'needs_attention');
    assert.equal((await sendTransfer(ctx, id)).status, 'needs_attention', 'timers stop retrying');
    assert.deepEqual(refs, [`TGT-${id}-1`, `TGT-${id}-2`, `TGT-${id}-3`]);
    globalThis.fetch = async (url, init) => (refs.push(JSON.parse(init.body).reference), ok({ id: 991 }));
    assert.equal((await sendTransfer(ctx, id, { manual: true })).status, 'submitted', 'admin can retry');
    assert.equal(refs.at(-1), `TGT-${id}-4`);
  });

  test('two workers sending the same payout at once make one transfer call', async () => {
    const t = boot();
    const id = await payoutRow(t);
    const ctx = flutterwaveCtx(t);
    let calls = 0;
    globalThis.fetch = async () => (calls++, ok({ id: 77 }));
    await Promise.all([sendTransfer(ctx, id), sendTransfer(ctx, id), sendTransfer(ctx, id)]);
    assert.equal(calls, 1);
  });
});

describe('Flutterwave transfer results', () => {
  test('the webhook is verified with Flutterwave before a payout is marked paid', async () => {
    const t = boot();
    const id = await payoutRow(t);
    const ctx = flutterwaveCtx(t);
    globalThis.fetch = async () => ok({ id: 5501 });
    await sendTransfer(ctx, id);
    const row = await t.one('SELECT * FROM ledger WHERE id = ?', id);
    assert.equal(row.status, 'submitted');

    let verified = null;
    globalThis.fetch = async (url) => {
      verified = String(url);
      return ok({ id: 5501, status: 'SUCCESSFUL' });
    };
    const body = { event: 'transfer.completed', data: { id: 5501, reference: row.transfer_ref, status: 'SUCCESSFUL', account_number: '0000000001' } };
    const forged = await t.call('POST', '/webhooks/flutterwave', body, null, { 'verif-hash': 'wrong' });
    assert.equal(forged.status, 401);
    const res = await t.call('POST', '/webhooks/flutterwave', body, null, { 'verif-hash': 'hook-secret' });
    assert.equal(res.status, 200);
    assert.match(verified, /\/transfers\/5501$/);
    assert.equal((await t.one('SELECT status FROM ledger WHERE id = ?', id)).status, 'success');
  });

  test('a transfer Flutterwave reports as failed is retried by the timers with a new reference', async () => {
    const t = boot();
    const id = await payoutRow(t);
    const ctx = flutterwaveCtx(t);
    globalThis.fetch = async () => ok({ id: 6601 });
    await sendTransfer(ctx, id);
    globalThis.fetch = async () => ok({ id: 6601, status: 'FAILED', complete_message: 'Account dormant' });
    await settleTransfer(ctx, { reference: `TGT-${id}-1` });
    const row = await t.one('SELECT * FROM ledger WHERE id = ?', id);
    assert.equal(row.status, 'failed');
    assert.equal(row.last_error, 'Account dormant');
  });
});

describe('settlement timing', () => {
  test('payouts wait for the next working day and then go out with the timers', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken, track } = await buyerPays(t, deal.token);
    const order = await t.one('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Packed, serial 42' }, seller);
    const rider = new URL((await t.one('SELECT rider_url FROM orders')).rider_url).searchParams.get('t');
    await t.post(`/api/rider/${rider}/status`, { status: 'out_for_delivery' });
    await t.post(`/api/rider/${rider}/pin`, { pin: track.order.pin });
    await t.post(`/api/track/${trackToken}/accept`);

    const payout = await t.one("SELECT * FROM ledger WHERE kind = 'seller_payout'");
    assert.equal(payout.status, 'pending');
    const notBefore = new Date(payout.not_before);
    const lagosDay = new Date(notBefore.getTime() + 3_600_000).getUTCDay();
    assert.ok(lagosDay !== 0 && lagosDay !== 6, 'never scheduled on a weekend');
    assert.ok(notBefore - new Date(order.paid_at) >= 24 * 3_600_000);
    const sms = (await t.one("SELECT sms FROM outbox WHERE event = 'payout_released'")).sms;
    assert.match(sms, /will be sent on .*settled/);

    await t.scheduled();
    assert.equal((await t.one("SELECT status FROM ledger WHERE kind = 'seller_payout'")).status, 'pending');
    t.advanceHours((notBefore - Date.now()) / 3_600_000 + 0.1);
    await t.scheduled();
    assert.equal((await t.one("SELECT status FROM ledger WHERE kind = 'seller_payout'")).status, 'success');
  });
});

describe('Monnify NIN verification', () => {
  test('logs in, checks the NIN and compares name and date of birth', async () => {
    const t = boot({ IDENTITY_PROVIDER: 'monnify', MONNIFY_API_KEY: 'MK_TEST', MONNIFY_SECRET_KEY: 'SK', MONNIFY_BASE_URL: 'https://monnify.test' });
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/api/v1/auth/login')) {
        return new Response(JSON.stringify({ requestSuccessful: true, responseCode: '0', responseBody: { accessToken: 'tok', expiresIn: 3000 } }));
      }
      return new Response(JSON.stringify({
        requestSuccessful: true, responseCode: '0',
        responseBody: { nin: '12345678901', firstName: 'ADEBAYO', lastName: 'JOHN', dateOfBirth: '15-Jan-1990', ninInformationMatch: true },
      }));
    };
    const token = await onboardSeller(t, SELLER, { identity: false });
    const wrongDob = await t.post('/api/seller/identity', { nin: '12345678901', dob: '1991-01-15' }, token);
    assert.match(wrongDob.data.error, /date of birth.*2 attempts left/);
    const okRes = await t.post('/api/seller/identity', { nin: '12345678901', dob: '1990-01-15' }, token);
    assert.equal(okRes.data.seller.identity_verified, true);

    const login = calls.find((c) => c.url.endsWith('/auth/login'));
    assert.equal(login.init.headers.Authorization, `Basic ${btoa('MK_TEST:SK')}`);
    const nin = calls.find((c) => c.url.endsWith('/api/v1/vas/nin-verification'));
    assert.equal(nin.init.headers.Authorization, 'Bearer tok');
    assert.deepEqual(JSON.parse(nin.init.body), { nin: '12345678901' });
    const seller = await t.one('SELECT id_type, id_last4, id_verified_name FROM sellers');
    assert.deepEqual({ ...seller }, { id_type: 'nin', id_last4: '8901', id_verified_name: 'ADEBAYO JOHN' });
  });

  test('a seller gets 3 attempts; Monnify outages do not use one up', async () => {
    const t = boot();
    const token = await onboardSeller(t, SELLER, { identity: false });
    for (const left of ['2 attempts left', '1 attempt left', 'last attempt']) {
      const r = await t.post('/api/seller/identity', { nin: '22222222222', dob: '1994-06-02' }, token);
      assert.match(r.data.error, new RegExp(`different name.*${left}`));
    }
    const blocked = await t.post('/api/seller/identity', { nin: '11111111111', dob: '1990-01-15' }, token);
    assert.equal(blocked.status, 429);
    assert.equal((await t.get('/api/seller/me', token)).data.seller.id_attempts_left, 0);

    const t2 = boot({ IDENTITY_PROVIDER: 'monnify', MONNIFY_API_KEY: 'k', MONNIFY_SECRET_KEY: 's', MONNIFY_BASE_URL: 'https://monnify.test' });
    globalThis.fetch = async () => new Response(JSON.stringify({ requestSuccessful: false, responseMessage: 'Service unavailable' }), { status: 503 });
    const token2 = await onboardSeller(t2, SELLER, { identity: false });
    const down = await t2.post('/api/seller/identity', { nin: '11111111111', dob: '1990-01-15' }, token2);
    assert.equal(down.status, 503);
    assert.equal((await t2.one('SELECT id_attempts FROM sellers')).id_attempts, 0);
  });
});
