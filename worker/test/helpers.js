// WORKER_ENTRY lets the same tests run against the single-file dashboard build.
const worker = (await import(process.env.WORKER_ENTRY || '../src/index.js')).default;
import { D1Shim } from './d1-shim.js';

export const SITE = 'https://site.test';
export const API = 'https://api.test';

export function boot(extraEnv = {}) {
  const clock = { offsetMs: 0 };
  const env = {
    DB: new D1Shim(),
    TEST_MODE: 'true',
    APP_SECRET: 'test-secret',
    ADMIN_PASSWORD: 'test-admin-password',
    SITE_URL: SITE,
    API_URL: API,
    ALLOWED_ORIGINS: SITE,
    __clock: () => new Date(Date.now() + clock.offsetMs),
    ...extraEnv,
  };
  const pending = [];
  const execCtx = { waitUntil: (p) => pending.push(p) };

  async function call(method, path, body, token, headers = {}) {
    const url = path.startsWith('http') ? path : API + path;
    const req = new Request(url, {
      method,
      headers: {
        Origin: SITE,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const res = await worker.fetch(req, env, execCtx);
    while (pending.length) await Promise.all(pending.splice(0));
    const type = res.headers.get('Content-Type') || '';
    return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
  }

  const db = (sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
  const one = (sql, ...args) => env.DB.prepare(sql).bind(...args).first();

  return {
    env,
    clock,
    call,
    db,
    one,
    get: (p, t) => call('GET', p, null, t),
    post: (p, b = {}, t) => call('POST', p, b, t),
    advanceHours: (h) => (clock.offsetMs += h * 3_600_000),
    scheduled: async (time = new Date(Date.now() + clock.offsetMs)) => {
      await worker.scheduled({ scheduledTime: time.getTime(), cron: '*/5 * * * *' }, env, execCtx);
      while (pending.length) await Promise.all(pending.splice(0));
    },
  };
}

export const SELLER = {
  full_name: 'Adebayo Oluwaseun John',
  business_name: 'Bayo Kicks',
  phone: '0803 123 4567',
  email: 'bayo@example.com',
};

export const DEAL = {
  item_title: 'Nike Tech Fleece sneakers, size 42, blue',
  item_description: 'Original, brand new in box with receipt. Blue colourway, size 42 EU.',
  item_condition: 'Brand new (sealed)',
  quantity: 1,
  item_price: '45,000',
  pickup_address: '12 Allen Avenue, Ikeja, Lagos',
  pickup_zone: 'ikeja',
  delivery_zone: 'lekki',
  delivery_days: 2,
  delivery_payer: 'buyer',
  fee_payer: 'buyer',
  expires_hours: 24,
};

export const BUYER = {
  buyer_name: 'Chioma Okafor',
  buyer_phone: '08091234567',
  buyer_email: 'chioma@example.com',
  delivery_address: '5 Admiralty Way, Lekki Phase 1, Lagos',
  delivery_landmark: 'Opposite the filling station',
  confirm_area: true,
  refund_bank_code: '058',
  refund_account_number: '0000000002',
};

// Signs a seller up (SMS code), verifies payout account and identity. Returns their session token.
export async function onboardSeller(t, seller = SELLER, { identity = true } = {}) {
  const s = await t.post('/api/auth/signup', seller);
  if (s.status !== 200) throw new Error('signup failed: ' + JSON.stringify(s.data));
  const v = await t.post('/api/auth/verify', { phone: seller.phone, code: s.data.dev_code });
  const token = v.data.token;
  await t.post('/api/seller/payout', { bank_code: '058', account_number: '0000000001' }, token);
  if (identity) await t.post('/api/seller/identity', { id_type: 'nin', id_number: '11111111111', dob: '1990-01-15' }, token);
  return token;
}

export async function login(t, phone = SELLER.phone) {
  const r = await t.post('/api/auth/login', { phone });
  return (await t.post('/api/auth/verify', { phone, code: r.data.dev_code })).data.token;
}

export async function createDeal(t, token, deal = DEAL) {
  const r = await t.post('/api/seller/deals', deal, token);
  if (r.status !== 200) throw new Error('create deal failed: ' + JSON.stringify(r.data));
  return { ...r.data.deal, token: new URL(r.data.deal.link).searchParams.get('d') };
}

// Buyer reviews, enters details and reaches the payment page. Returns the payment URL.
export async function buyerCheckout(t, dealToken, buyer = BUYER) {
  const accept = await t.post(`/api/deals/${dealToken}/accept`);
  if (accept.status !== 200) return accept;
  return t.post(`/api/deals/${dealToken}/pay`, { ...buyer, checkout_id: accept.data.checkout_id });
}

// Completes the simulated payment page and follows the redirect back. Returns the tracking token.
export async function completePayment(t, paymentUrl, result = 'successful') {
  const path = new URL(paymentUrl).pathname;
  const back = await t.post(path, { result });
  const done = await t.get(back.headers.get('Location'));
  return new URL(done.headers.get('Location')).searchParams.get('t');
}

export async function buyerPays(t, dealToken, buyer = BUYER, result = 'successful') {
  const r = await buyerCheckout(t, dealToken, buyer);
  if (r.status !== 200) return { error: r };
  const trackToken = await completePayment(t, r.data.payment_url, result);
  return { trackToken, track: (await t.get(`/api/track/${trackToken}`)).data };
}
