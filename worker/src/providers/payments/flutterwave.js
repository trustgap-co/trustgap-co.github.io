import { safeEqual } from '../../lib/crypto.js';
import { NIGERIAN_BANKS } from './banks.js';

// Flutterwave v3 adapter, written from Flutterwave's public v3 docs. Check each call against the
// current docs and the products approved on your account before relying on it.
// IMPORTANT: collecting into your Flutterwave balance and paying out later is NOT automatically a
// lawful escrow. Get written approval for this flow first.
export function createFlutterwavePayments(ctx) {
  const { env, config } = ctx;
  const secretKey = String(env.FLW_SECRET_KEY || '').trim(); // pasted keys often end with a space or newline
  if (!secretKey) throw new Error('FLW_SECRET_KEY is required when PAYMENT_PROVIDER=flutterwave');
  const isTest = secretKey.startsWith('FLWSECK_TEST');
  // Safety lock: a live key does nothing until ALLOW_LIVE_PAYMENTS=true. Only payment actions stop
  // (with this reason); every other page keeps working, and /api/health shows the reason.
  const blocked = isTest ? null
    : !secretKey.startsWith('FLWSECK-')
      ? 'FLW_SECRET_KEY doesn’t look like a Flutterwave v3 secret key (it should start with FLWSECK_TEST- or FLWSECK-). Copy it from Flutterwave → Settings → API keys.'
      : String(env.ALLOW_LIVE_PAYMENTS).trim() !== 'true'
        ? 'A live Flutterwave key is set, but live payments are locked. Use your test key (FLWSECK_TEST-…) or, only once holding customer money is approved, set ALLOW_LIVE_PAYMENTS = true.'
        : null;
  const apiBase = env.FLW_API_BASE || 'https://api.flutterwave.com/v3';

  // Errors carry `definite` (Flutterwave answered and said no) or not (network error / 5xx: the
  // request may or may not have gone through), plus `duplicate` for a reused transfer reference.
  async function call(method, path, body) {
    if (blocked) throw Object.assign(new Error(blocked), { definite: false, locked: true });
    let res;
    try {
      res = await fetch(apiBase + path, {
        method,
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw Object.assign(new Error(`Flutterwave unreachable: ${err.message}`), { definite: false });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === 'error') {
      const message = data.message || String(res.status);
      throw Object.assign(new Error(`Flutterwave ${method} ${path} failed: ${message}`), {
        definite: res.status < 500,
        duplicate: /already exist|duplicate/i.test(message),
      });
    }
    return data.data;
  }

  return {
    name: 'flutterwave',
    isTest,
    blocked,
    async listBanks() {
      try {
        const data = await call('GET', '/banks/NG');
        return data.map((b) => ({ code: b.code, name: b.name })).sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        return NIGERIAN_BANKS;
      }
    },
    // Errors here are shown to the person as they are, so they're written in plain words.
    async resolveAccount({ bankCode, accountNumber }) {
      try {
        const data = await call('POST', '/accounts/resolve', { account_number: accountNumber, account_bank: bankCode });
        return { accountName: data.account_name };
      } catch (err) {
        if (err.locked) throw err;
        if (err.definite === false) {
          throw new Error('We couldn’t reach the bank to check this account just now. Please try again in a minute.');
        }
        console.warn('account resolve refused', bankCode, err.message);
        throw new Error('We couldn’t find that account number at that bank. Check both and try again.'
          + (isTest ? ' (Flutterwave test mode only recognises its test accounts, e.g. Access Bank 0690000032.)' : ''));
      }
    },
    async createCheckout({ order, title }) {
      const data = await call('POST', '/payments', {
        tx_ref: order.tx_ref,
        amount: order.amount / 100,
        currency: 'NGN',
        redirect_url: `${config.apiUrl}/api/payments/callback`,
        customer: { email: order.buyer_email, phonenumber: order.buyer_phone, name: order.buyer_name },
        // Branding on Flutterwave's checkout page. The Flutterwave account belongs to Tubalcain Ads
        // Enterprise; this shows TrustGap's name and logo to buyers instead. (No "escrow" wording.)
        customizations: {
          title: 'TrustGap',
          description: `${title} · Payment secured under TrustGap deal rules`.slice(0, 150),
          logo: config.checkoutLogoUrl,
        },
        meta: { order_ref: order.ref },
        session_duration: config.paymentTimeoutMinutes,
        max_retry_attempt: 3,
      });
      return { url: data.link };
    },
    async verify(txRef) {
      try {
        const data = await call('GET', `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
        return {
          status: data.status === 'successful' ? 'successful' : data.status === 'failed' ? 'failed' : 'pending',
          amount: Math.round(Number(data.amount) * 100),
          currency: data.currency,
          providerTxId: String(data.id),
        };
      } catch {
        return { status: 'not_found' };
      }
    },
    // Tells the Worker what to re-check. The webhook body itself is never trusted: payments and
    // transfers are always confirmed with Flutterwave's API before anything changes.
    async parseWebhook(request, body) {
      const hash = env.FLW_WEBHOOK_HASH;
      if (!hash || !safeEqual(request.headers.get('verif-hash') || '', hash)) return null;
      const event = String(body?.event || body?.['event.type'] || '');
      const data = body?.data || {};
      if (event.startsWith('transfer') || data.account_number !== undefined) {
        return data.reference ? { kind: 'transfer', reference: data.reference, providerRef: String(data.id || '') } : null;
      }
      return data.tx_ref ? { kind: 'charge', txRef: data.tx_ref } : null;
    },
    async verifyTransfer({ providerRef }) {
      if (!providerRef) return { status: 'pending' };
      try {
        const data = await call('GET', `/transfers/${encodeURIComponent(providerRef)}`);
        const st = String(data.status).toUpperCase();
        return {
          status: st === 'SUCCESSFUL' ? 'success' : st === 'FAILED' ? 'failed' : 'pending',
          reason: data.complete_message,
          providerRef: String(data.id),
        };
      } catch {
        return { status: 'pending' };
      }
    },
    async transfer({ amount, bankCode, accountNumber, narration, reference }) {
      const data = await call('POST', '/transfers', {
        account_bank: bankCode,
        account_number: accountNumber,
        amount: amount / 100,
        currency: 'NGN',
        debit_currency: 'NGN',
        narration,
        reference,
      });
      // Final status arrives by webhook (transfer.completed); the reconciliation timer also checks.
      return { status: 'submitted', providerRef: String(data.id) };
    },
  };
}
