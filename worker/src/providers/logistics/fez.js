import { hmacHex, safeEqual } from '../../lib/crypto.js';

// Fez Delivery adapter, built from Fez's API docs (Create / Get / Cancel order, Fetch Delivery Cost,
// Register Order Webhook, Order Webhook Request).
//
// Every request sends `Authorization: Bearer <token>` and `secret-key: <your secret key>`.
// The Worker logs in with FEZ_USER_ID + FEZ_PASSWORD (the admin credentials Fez gives you after
// onboarding/KYC) at POST /user/authenticate, which returns the token (authDetails.authToken),
// its expiry (authDetails.expireToken, Lagos time) and your organisation's secret key
// (orgDetails["secret-key"]). FEZ_SECRET_KEY is optional: set it only to override that.
//
// Note: Fez charges each order to your Fez business wallet. Orders stay "Pending Payment" until the
// wallet is funded, so keep it topped up.

// Fez order status → TrustGap delivery stage.
export function mapFezStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('deliver')) return 'delivered';
  if (s.includes('return')) return 'returned';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('dispatch')) return 'out_for_delivery';
  if (s.includes('picked')) return 'picked_up';
  if (s.includes('failed') || s.includes('rejected')) return 'problem';
  if (s.includes('pending payment')) return 'awaiting_payment';
  return 'booked'; // Pending Pick-Up, Pending Drop-off, Dropped-off, …
}

let session = null; // { key, token, secretKey, expiresAt }, reused until shortly before it expires

// Fez's expireToken is "YYYY-MM-DD HH:MM:SS" with no timezone; Fez runs on Lagos time (UTC+1).
export function parseFezExpiry(value) {
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  return m ? Date.parse(`${m[1]}T${m[2]}+01:00`) : NaN;
}

export function createFezLogistics(ctx) {
  // Values pasted into the Cloudflare dashboard often carry a stray space or line break.
  const clean = (v) => String(v ?? '').trim();
  const env = { ...ctx.env, FEZ_USER_ID: clean(ctx.env.FEZ_USER_ID), FEZ_PASSWORD: clean(ctx.env.FEZ_PASSWORD), FEZ_SECRET_KEY: clean(ctx.env.FEZ_SECRET_KEY), FEZ_API_BASE: clean(ctx.env.FEZ_API_BASE) };
  if (!env.FEZ_USER_ID || !env.FEZ_PASSWORD) {
    throw new Error('FEZ_USER_ID and FEZ_PASSWORD are required when LOGISTICS_PROVIDER=fez');
  }
  const base = String(env.FEZ_API_BASE || 'https://apisandbox.fezdelivery.co/v1').replace(/\/$/, '');

  async function send(method, path, body, auth) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { 'secret-key': auth.secretKey, Authorization: `Bearer ${auth.token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new Error(`Fez unreachable: ${err.message}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.status).toLowerCase() === 'error') {
      const sandbox = base.includes('sandbox') ? 'sandbox' : 'live';
      const hint = path === '/user/authenticate' ? ` (checked against Fez ${sandbox} at ${base}; ${sandbox === 'sandbox' ? 'sandbox logins are separate from your normal Fez account' : 'use your live Fez API user ID and password'})` : '';
      throw Object.assign(new Error(`Fez: ${data.description || data.message || res.status}${hint}`), { status: res.status });
    }
    return data;
  }

  async function login({ force = false } = {}) {
    const key = `${base}|${env.FEZ_USER_ID}`;
    if (!force && session?.key === key && session.expiresAt > ctx.now().getTime() + 5 * 60_000) return session;
    const data = await send('POST', '/user/authenticate', { user_id: env.FEZ_USER_ID, password: env.FEZ_PASSWORD });
    const token = data.authDetails?.authToken;
    const secretKey = env.FEZ_SECRET_KEY || data.orgDetails?.['secret-key'];
    if (!token) throw new Error('Fez login worked but returned no authToken.');
    if (!secretKey) throw new Error('Fez login returned no secret-key; set FEZ_SECRET_KEY.');
    const expiry = parseFezExpiry(data.authDetails?.expireToken);
    session = { key, token, secretKey, expiresAt: Number.isFinite(expiry) ? expiry : ctx.now().getTime() + 50 * 60_000 };
    return session;
  }

  // Signed-in call. If Fez says the token is no longer valid (401), log in again and retry once.
  async function call(method, path, body) {
    try {
      return await send(method, path, body, await login());
    } catch (err) {
      if (err.status !== 401) throw err;
      return send(method, path, body, await login({ force: true }));
    }
  }

  return {
    name: 'fez',
    // Live Fez books real pickups that Fez bills for; the sandbox doesn't.
    live: !base.includes('sandbox'),

    // POST /order/cost: the amount charged is cost + VAT ("totalCost").
    async quote({ pickupState, dropoffState, weightKg }) {
      const data = await call('POST', '/order/cost', { state: dropoffState, pickUpState: pickupState, weight: weightKg });
      const total = Number(data.totalCost ?? (Number(data.cost?.cost ?? data.Cost?.cost) + Number(data.vat?.vatAmount || 0)));
      if (!Number.isFinite(total) || total <= 0) throw new Error(`Fez returned no delivery price for ${dropoffState}.`);
      return { feeKobo: Math.ceil(total) * 100 };
    },

    // POST /order books the pickup. uniqueID is our order reference, and the buyer's delivery PIN
    // goes in CustToken (Fez's "token sent to recipient for confirmation of receipt").
    async book({ order, deal, seller, pin }) {
      const data = await call('POST', '/order', [
        {
          recipientAddress: order.delivery_address,
          recipientState: order.delivery_state,
          recipientName: order.buyer_name,
          recipientPhone: order.buyer_phone,
          recipientEmail: order.buyer_email,
          uniqueID: order.ref,
          BatchID: order.ref,
          CustToken: pin,
          itemDescription: `${deal.item_title} (x${deal.quantity})`.slice(0, 250),
          additionalDetails: [order.delivery_landmark && `Landmark: ${order.delivery_landmark}`, order.packing_note && `Contents: ${order.packing_note}`, 'Buyer gives a 4-digit PIN only after checking the item.']
            .filter(Boolean)
            .join(' | '),
          valueOfItem: String(Math.round(deal.item_price / 100)),
          weight: deal.weight_kg,
          pickUpState: deal.pickup_state,
          pickUpAddress: deal.pickup_address,
          thirdparty: 'true',
          senderName: seller.business_name,
          senderAddress: deal.pickup_address,
          senderPhone: seller.phone,
          fragile: Boolean(deal.fragile),
        },
      ]);
      const orderNo = data.orderNos?.[order.ref];
      if (!orderNo) throw new Error(`Fez did not return an order number (${data.description || 'no details'}).`);
      return { deliveryRef: orderNo, riderUrl: null };
    },

    // A return is a new Fez order the other way round: collected from the buyer, delivered to the
    // seller's pickup address. The seller's return PIN goes in CustToken, so Fez marks it delivered
    // only when the seller gives the rider that PIN.
    async bookReturn({ order, deal, seller, pin, ref }) {
      const data = await call('POST', '/order', [
        {
          recipientAddress: deal.pickup_address,
          recipientState: deal.pickup_state,
          recipientName: seller.business_name,
          recipientPhone: seller.phone,
          recipientEmail: seller.email,
          uniqueID: ref,
          BatchID: ref,
          CustToken: pin,
          itemDescription: `RETURN: ${deal.item_title} (x${deal.quantity})`.slice(0, 250),
          additionalDetails: [`Return for order ${order.ref}`, order.delivery_landmark && `Pickup landmark: ${order.delivery_landmark}`, 'Seller gives a 4-digit PIN only after checking the item.']
            .filter(Boolean)
            .join(' | '),
          valueOfItem: String(Math.round(deal.item_price / 100)),
          weight: deal.weight_kg,
          pickUpState: order.delivery_state,
          pickUpAddress: order.delivery_address,
          thirdparty: 'true',
          senderName: order.buyer_name,
          senderAddress: order.delivery_address,
          senderPhone: order.buyer_phone,
          fragile: Boolean(deal.fragile),
        },
      ]);
      const orderNo = data.orderNos?.[ref];
      if (!orderNo) throw new Error(`Fez did not return an order number (${data.description || 'no details'}).`);
      return { deliveryRef: orderNo, riderUrl: null };
    },

    // GET /orders/{orderNo}
    async getStatus(orderNo) {
      const data = await call('GET', `/orders/${encodeURIComponent(orderNo)}`);
      const details = Array.isArray(data.orderDetails) ? data.orderDetails[0] : data.orderDetails;
      if (!details) return null;
      return { raw: details.orderStatus, stage: mapFezStatus(details.orderStatus), reason: details.returnReason || details.statusDescription || null };
    },

    // Fez's status webhook: { orderNumber, status } with X-Timestamp and
    // X-Signature = SHA-256 HMAC (hex) of orderNo + status + timestamp, keyed with your secret key.
    // It is only a hint: the status is always re-read with getStatus() before anything changes.
    async parseWebhook(request, body) {
      const orderNo = body?.orderNumber || body?.orderNo;
      const status = body?.status ?? body?.orderStatus ?? '';
      if (!orderNo) return null;
      const timestamp = request.headers.get('X-Timestamp') || '';
      const signature = (request.headers.get('X-Signature') || '').toLowerCase();
      const { secretKey } = await login();
      const expected = await hmacHex(secretKey, `${orderNo}${status}${timestamp}`);
      const fresh = Math.abs(ctx.now().getTime() / 1000 - Number(timestamp)) < 15 * 60;
      return { deliveryRef: String(orderNo), signatureValid: safeEqual(signature, expected) && fresh };
    },

    // POST /webhooks/store
    async registerWebhook(url) {
      return call('POST', '/webhooks/store', { webhook: url });
    },

    // POST /order/cancel: only while Fez still allows it (before dispatch).
    async cancel(orderNo, reason) {
      return call('POST', '/order/cancel', { orderNo, reason: String(reason).slice(0, 255) });
    },
  };
}
