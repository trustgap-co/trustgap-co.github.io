import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHmac } from 'node:crypto';
import { boot, onboardSeller, createDeal, buyerPays, SELLER, BUYER } from './helpers.js';

// Replaces global fetch for one test, recording calls to external services.
let realFetch;
let calls;
function stubFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
}
beforeEach(() => (realFetch = globalThis.fetch));
afterEach(() => (globalThis.fetch = realFetch));

const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Make.com notifications', () => {
  test('messages are signed and delivered to the Make webhook', async () => {
    stubFetch(() => ok({ accepted: true }));
    const t = boot({ MAKE_WEBHOOK_URL: 'https://hook.make.test/abc', MAKE_WEBHOOK_SECRET: 'make-secret' });
    await t.post('/api/auth/signup', { full_name: 'Adebayo Oluwaseun John', business_name: 'Bayo', phone: '08031234567', email: 'b@x.ng', terms_accepted: true });
    assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.equal(url, 'https://hook.make.test/abc');
    const body = JSON.parse(init.body);
    assert.equal(body.event, 'login_code');
    assert.equal(body.to_phone_intl, '2348031234567');
    assert.match(body.sms, /Your TrustGap code is \d{6}/);
    const expected = createHmac('sha256', 'make-secret').update(init.body).digest('base64url');
    assert.equal(init.headers['X-TrustGap-Signature'], expected);
    assert.equal((await t.one('SELECT status FROM outbox')).status, 'sent');
  });

  test('failed deliveries are retried by the timer', async () => {
    let up = false;
    stubFetch(() => (up ? ok({}) : new Response('down', { status: 500 })));
    const t = boot({ MAKE_WEBHOOK_URL: 'https://hook.make.test/abc' });
    await t.post('/api/auth/signup', { full_name: 'Adebayo Oluwaseun John', business_name: 'Bayo', phone: '08031234567', email: 'b@x.ng', terms_accepted: true });
    assert.equal((await t.one('SELECT status FROM outbox')).status, 'failed');
    up = true;
    await t.scheduled();
    const row = await t.one('SELECT status, attempts FROM outbox');
    assert.equal(row.status, 'sent');
    assert.equal(row.attempts, 2);
  });
});

describe('Google Sheets copy', () => {
  test('syncs orders, sellers, disputes and ledger without sensitive data', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    let written;
    stubFetch((url, init) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'tok' });
      if (url.includes('?fields=sheets.properties.title')) return ok({ sheets: [{ properties: { title: 'Orders' } }] });
      if (url.endsWith('/values:batchUpdate')) written = JSON.parse(init.body);
      return ok({});
    });
    const t = boot({ GOOGLE_SHEET_ID: 'sheet123', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'bot@x.iam.gserviceaccount.com', GOOGLE_PRIVATE_KEY: pem });
    const deal = await createDeal(t, await onboardSeller(t, { ...SELLER, marketing_opt_in: true }));
    await buyerPays(t, deal.token, { ...BUYER, marketing_opt_in: true });
    const deal2 = await createDeal(t, await onboardSeller(t, { ...SELLER, phone: '0803 555 0000', email: 'no@example.com' }));
    await buyerPays(t, deal2.token, { ...BUYER, buyer_phone: '08075550000', buyer_email: 'quiet@example.com' });
    const admin = (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
    const res = await t.post('/api/admin/sync-sheets', {}, admin);
    assert.equal(res.status, 200, JSON.stringify(res.data));

    const add = calls.find((c) => c.url.endsWith(':batchUpdate') && !c.url.includes('values'));
    assert.deepEqual(JSON.parse(add.init.body).requests.map((r) => r.addSheet.properties.title), ['Summary', 'Sellers', 'Marketing contacts', 'Returns', 'Debt payments', 'Disputes', 'Ledger']);
    const tab = (name) => written.data.find((d) => d.range === `'${name}'!A1`).values;
    const orders = tab('Orders');
    assert.equal(orders[1][1], 'paid');
    assert.equal(orders[1][7], 49957);
    assert.equal(orders[1][6], 'Lagos');
    assert.ok(orders[1][14] && orders[1][15], 'both confirmations are recorded with their times');
    const marketing = tab('Marketing contacts');
    assert.deepEqual(marketing.slice(1).map((r) => [r[0], r[3]]).sort(), [['buyer', '+2348091234567'], ['seller', '+2348031234567']],
      'only the seller and buyer who opted in');
    assert.doesNotMatch(JSON.stringify(marketing), /quiet@example|no@example/);
    const everything = JSON.stringify(written);
    assert.doesNotMatch(everything, /0000000002|Admiralty|11111111111/);
    assert.ok(calls.every((c) => !c.init.headers?.Authorization || c.init.headers.Authorization === 'Bearer tok'));
  });

  test('is skipped when not configured', async () => {
    const t = boot();
    const admin = (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
    const res = await t.post('/api/admin/sync-sheets', {}, admin);
    assert.match(res.data.result.skipped, /not configured/);
  });
});

describe('Flutterwave adapter guard', () => {
  test('checkout page shows TrustGap’s name and logo', async () => {
    let payload;
    stubFetch((url, init) => {
      if (url.endsWith('/payments')) { payload = JSON.parse(init.body); return ok({ status: 'success', data: { link: 'https://checkout.flutterwave.test/pay/abc' } }); }
      if (url.includes('/accounts/resolve')) return ok({ status: 'success', data: { account_name: 'Adebayo Oluwaseun John' } });
      if (url.includes('/banks/NG')) return ok({ status: 'success', data: [{ code: '044', name: 'Access Bank' }] });
      return ok({ status: 'success', data: {} });
    });
    const t = boot({ PAYMENT_PROVIDER: 'flutterwave', FLW_SECRET_KEY: 'FLWSECK_TEST-abc' });
    const token = await onboardSeller(t);
    await t.db("UPDATE sellers SET amount_owed = 100000");
    const r = await t.post('/api/seller/debt/pay', {}, token);
    assert.equal(r.data.payment_url, 'https://checkout.flutterwave.test/pay/abc');
    assert.equal(payload.customizations.title, 'TrustGap');
    assert.equal(payload.customizations.logo, 'https://site.test/assets/favicon.png');
    assert.match(payload.customizations.description, /Payment secured under TrustGap deal rules/);
    assert.doesNotMatch(JSON.stringify(payload), /escrow/i);
    assert.equal(payload.amount, 1000);
    assert.equal(payload.redirect_url, 'https://api.test/api/payments/callback');
  });

  test('account checks give plain messages, with the test-account tip in test mode', async () => {
    const t = boot({ PAYMENT_PROVIDER: 'flutterwave', FLW_SECRET_KEY: 'FLWSECK_TEST-abc' });
    let mode = 'refuse';
    stubFetch((url) => {
      if (url.includes('/banks/NG')) return ok({ status: 'success', data: [{ code: '044', name: 'Access Bank' }] });
      if (url.includes('/accounts/resolve')) {
        if (mode === 'down') throw new Error('socket hang up');
        if (mode === 'refuse') return new Response(JSON.stringify({ status: 'error', message: 'invalid account' }), { status: 400 });
        return ok({ status: 'success', data: { account_number: '0690000032', account_name: 'Adebayo Oluwaseun John' } });
      }
      return ok({});
    });
    assert.equal((await t.get('/api/config')).data.test_accounts, 'flutterwave');
    const s = await t.post('/api/auth/signup', { full_name: 'Adebayo Oluwaseun John', business_name: 'Bayo', phone: '08031234567', email: 'b@x.ng', terms_accepted: true });
    const token = (await t.post('/api/auth/verify', { phone: '08031234567', code: s.data.dev_code })).data.token;
    const refused = await t.post('/api/seller/payout', { bank_code: '044', account_number: '0000000002' }, token);
    assert.equal(refused.data.error, 'Payout account: We couldn’t find that account number at that bank. Check both and try again. (Flutterwave test mode only recognises its test accounts, e.g. Access Bank 0690000032.)');
    assert.doesNotMatch(refused.data.error, /POST|accounts\/resolve/);
    mode = 'down';
    assert.match((await t.post('/api/seller/payout', { bank_code: '044', account_number: '0690000032' }, token)).data.error, /couldn’t reach the bank/);
    mode = 'ok';
    assert.equal((await t.post('/api/seller/payout', { bank_code: '044', account_number: '0690000032' }, token)).status, 200);
  });

  test('a live key stays locked without ALLOW_LIVE_PAYMENTS, but only payments stop', async () => {
    stubFetch(() => ok({ status: 'success', data: [] }));
    const t = boot({ PAYMENT_PROVIDER: ' Flutterwave ', FLW_SECRET_KEY: 'FLWSECK-live-123 ' });
    assert.equal((await t.get('/api/config')).status, 200, 'pages still load');
    const health = (await t.get('/api/health')).data;
    assert.equal(health.ok, false);
    assert.match(health.settings, /live payments are locked/);
    const s = await t.post('/api/auth/signup', { full_name: 'Adebayo Oluwaseun John', business_name: 'Bayo', phone: '08031234567', email: 'b@x.ng', terms_accepted: true });
    assert.equal(s.status, 200, 'sellers can still sign up');
    const token = (await t.post('/api/auth/verify', { phone: '08031234567', code: s.data.dev_code })).data.token;
    const payout = await t.post('/api/seller/payout', { bank_code: '044', account_number: '0690000032' }, token);
    assert.equal(payout.status, 503);
    assert.match(payout.data.error, /live payments are locked/);
    assert.ok(calls.every((c) => !String(c.init.headers?.Authorization || '').includes('FLWSECK-live')), 'the live key is never used');
    const allowed = boot({ PAYMENT_PROVIDER: 'flutterwave', FLW_SECRET_KEY: 'FLWSECK-live-123', ALLOW_LIVE_PAYMENTS: 'true' });
    assert.equal((await allowed.get('/api/health')).data.settings, 'ok');
    const odd = boot({ PAYMENT_PROVIDER: 'flutterwave', FLW_SECRET_KEY: 'sk_live_abc' });
    assert.match((await odd.get('/api/health')).data.settings, /doesn’t look like a Flutterwave v3 secret key/);
    const unknown = boot({ LOGISTICS_PROVIDER: 'gig' });
    assert.match((await unknown.get('/api/health')).data.settings, /LOGISTICS_PROVIDER is "gig"/);
    const broken = await unknown.get('/api/config');
    assert.equal(broken.status, 500);
    assert.match(broken.data.error, /\(Ref [A-Z0-9]{6}\)/);
    assert.match(broken.data.detail, /LOGISTICS_PROVIDER is "gig"/, 'in test mode the cause is shown');
  });
});

describe('survey and early-access answers through the Worker', () => {
  const answers = { form: 'survey', submission_id: 'abc-123', role: 'buyer', concerns: ['scams', 'delivery'], phone: '+2348031234567' };
  test('forwarded to the Make webhook (a secret), with duplicates and bots dropped', async () => {
    const sent = [];
    stubFetch((url, init) => { sent.push({ url, body: String(init.body) }); return new Response('Accepted'); });
    const t = boot({ LEADS_WEBHOOK_URL: 'https://hook.eu1.make.com/secret-abc' });
    const r = await t.post('/api/leads', answers);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://hook.eu1.make.com/secret-abc');
    assert.match(sent[0].body, /concerns=scams\+%7C\+delivery/);
    assert.equal((await t.post('/api/leads', answers)).data.duplicate, true);
    await t.post('/api/leads', { ...answers, submission_id: 'bot', website: 'http://spam' });
    assert.equal(sent.length, 1, 'duplicates and bots are not forwarded');
    assert.equal((await t.post('/api/leads', { form: 'other' })).status, 400);
    assert.equal((await t.post('/api/leads', { form: 'survey', 'bad key!': 'x' })).status, 400);
    assert.equal((await t.post('/api/leads', { form: 'survey', a: 'x'.repeat(2000), b: 'x'.repeat(2000), ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}`, 'y'.repeat(1500)])) })).status, 400);
  });
  test('without LEADS_WEBHOOK_URL the visitor is told it couldn’t be saved', async () => {
    const t = boot();
    const r = await t.post('/api/leads', answers);
    assert.equal(r.status, 503);
  });
  test('at most 6 responses an hour from one connection', async () => {
    stubFetch(() => new Response('Accepted'));
    const t = boot({ LEADS_WEBHOOK_URL: 'https://hook.eu1.make.com/secret-abc' });
    const ip = { 'CF-Connecting-IP': '203.0.113.50' };
    let last;
    for (let i = 0; i < 7; i++) last = await t.call('POST', '/api/leads', { form: 'survey', submission_id: `id-${i}` }, null, ip);
    assert.equal(last.status, 429);
  });
});
