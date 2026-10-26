import { all, first, run } from '../lib/db.js';

// Read-only copy of the database into Google Sheets for viewing and reporting.
// D1 stays the source of truth: edits made in the sheet are overwritten on the next sync.
// Sensitive data (bank account numbers, PINs, full addresses, ID numbers) is never copied.
// Tab names with spaces are quoted in ranges ('Marketing contacts'!A1).

const naira = (kobo) => (kobo == null ? '' : kobo / 100);
const ROW_LIMIT = 5000;

const TABS = {
  Orders: {
    sql: `SELECT o.*, d.item_title, d.condition_confirmed_at, s.business_name
          FROM orders o JOIN deals d ON d.id = o.deal_id JOIN sellers s ON s.id = o.seller_id
          WHERE o.status != 'cancelled' ORDER BY o.id DESC LIMIT ${ROW_LIMIT}`,
    header: ['Ref', 'Status', 'Item', 'Seller', 'Buyer', 'Buyer phone', 'Delivery state', 'Paid (₦)', 'Seller gets (₦)',
      'Delivery', 'Paid at', 'Delivered at', 'Closed at', 'Created at', 'Seller confirmed condition at', 'Buyer accepted change-of-mind notice at'],
    row: (o) => [o.ref, o.status, o.item_title, o.business_name, o.buyer_name, o.buyer_phone, o.delivery_state || '',
      naira(o.amount), naira(o.seller_payout), o.delivery_status, o.paid_at, o.delivered_at, o.closed_at, o.created_at,
      o.condition_confirmed_at || '', o.buyer_ack_at || ''],
  },
  Sellers: {
    sql: `SELECT * FROM sellers ORDER BY id DESC LIMIT ${ROW_LIMIT}`,
    header: ['ID', 'Business', 'Full name', 'Phone', 'Email', 'Phone verified', 'ID verified', 'Payout bank', 'Owes (₦)', 'Suspended', 'Joined', 'News & offers opt-in'],
    row: (s) => [s.id, s.business_name, s.full_name, s.phone, s.email, s.phone_verified_at ? 'yes' : 'no', s.identity_verified_at ? 'yes' : 'no',
      s.payout_bank_name || '', naira(s.amount_owed), s.suspended_at ? 'yes' : '', s.created_at, s.marketing_opt_in_at || ''],
  },
  // Sellers and buyers who ticked "send me TrustGap news and offers". Only these may get newsletters
  // and promotions. One row per buyer phone number (their latest order).
  'Marketing contacts': {
    sql: `SELECT 'seller' AS role, full_name AS name, business_name, phone, email, marketing_opt_in_at AS opted_in_at, 'seller sign-up' AS source
            FROM sellers WHERE marketing_opt_in_at IS NOT NULL
          UNION ALL
          SELECT 'buyer', o.buyer_name, '', o.buyer_phone, o.buyer_email, o.buyer_marketing_opt_in_at, 'order ' || o.ref
            FROM orders o WHERE o.buyer_marketing_opt_in_at IS NOT NULL AND o.status NOT IN ('awaiting_payment', 'cancelled')
              AND o.id = (SELECT MAX(id) FROM orders o2 WHERE o2.buyer_phone = o.buyer_phone AND o2.buyer_marketing_opt_in_at IS NOT NULL
                          AND o2.status NOT IN ('awaiting_payment', 'cancelled'))
          ORDER BY opted_in_at DESC LIMIT ${ROW_LIMIT}`,
    header: ['Role', 'Name', 'Business', 'Phone', 'Email', 'Opted in at', 'Source'],
    row: (c) => [c.role, c.name, c.business_name || '', c.phone, c.email || '', c.opted_in_at, c.source],
  },
  'Debt payments': {
    sql: `SELECT p.*, s.business_name FROM debt_payments p JOIN sellers s ON s.id = p.seller_id ORDER BY p.id DESC LIMIT ${ROW_LIMIT}`,
    header: ['ID', 'Seller', 'Amount (₦)', 'Status', 'Provider ref', 'Started', 'Paid at'],
    row: (p) => [p.id, p.business_name, naira(p.amount), p.status, p.provider_tx_id || '', p.created_at, p.paid_at || ''],
  },
  Disputes: {
    sql: `SELECT x.*, o.ref FROM disputes x JOIN orders o ON o.id = x.order_id ORDER BY x.id DESC LIMIT ${ROW_LIMIT}`,
    header: ['ID', 'Order', 'Status', 'Category', 'Opened by', 'Description', 'Decision', 'Buyer refund (₦)', 'Seller payout (₦)', 'Seller charge (₦)', 'Opened', 'Resolved'],
    row: (x) => [x.id, x.ref, x.status, x.category, x.opened_by, x.description, x.resolution_note || '', naira(x.buyer_refund), naira(x.seller_payout),
      naira(x.seller_charge), x.created_at, x.resolved_at || ''],
  },
  Ledger: {
    sql: `SELECT l.*, o.ref FROM ledger l LEFT JOIN orders o ON o.id = l.order_id ORDER BY l.id DESC LIMIT ${ROW_LIMIT}`,
    header: ['ID', 'Order', 'Kind', 'To', 'Amount (₦)', 'Status', 'Provider ref', 'Created'],
    row: (l) => [l.id, l.ref, l.kind, l.counterparty, naira(l.amount), l.status, l.provider_ref || '', l.created_at],
  },
};

function pemToDer(pem) {
  const b64 = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function accessToken(env, now) {
  const iat = Math.floor(now.getTime() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  }));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.GOOGLE_PRIVATE_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const jwt = `${header}.${claims}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Google auth failed: ' + (data.error_description || data.error || res.status));
  return data.access_token;
}

export const sheetsConfigured = (env) => Boolean(env.GOOGLE_SHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);

export async function syncSheets(ctx) {
  const { env } = ctx;
  if (!sheetsConfigured(env)) return { skipped: 'Google Sheets is not configured' };
  const token = await accessToken(env, ctx.now());
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}`;
  const google = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Sheets ${path}: ${data.error?.message || res.status}`);
    return data;
  };

  const tabs = { Summary: null, ...TABS };
  const meta = await google('GET', '?fields=sheets.properties.title');
  const existing = new Set(meta.sheets.map((s) => s.properties.title));
  const missing = Object.keys(tabs).filter((t) => !existing.has(t));
  if (missing.length) {
    await google('POST', ':batchUpdate', { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) });
  }

  const held = await first(env, "SELECT COALESCE(SUM(amount), 0) t FROM orders WHERE status IN ('paid','shipping','delivered','disputed')");
  const openDisputes = await first(env, "SELECT COUNT(*) n FROM disputes WHERE status = 'open'");
  const data = [
    {
      range: 'Summary!A1',
      values: [
        ['TrustGap: read-only copy. Edits here are overwritten.'],
        ['Last synced', ctx.now().toISOString()],
        ['Money held for open orders (₦)', naira(held.t)],
        ['Open disputes', openDisputes.n],
      ],
    },
  ];
  for (const [title, tab] of Object.entries(TABS)) {
    const rows = await all(env, tab.sql);
    data.push({ range: `'${title}'!A1`, values: [tab.header, ...rows.map(tab.row)] });
  }
  await google('POST', '/values:batchClear', { ranges: Object.keys(tabs).map((t) => `'${t}'!A:Z`) });
  await google('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data });
  await run(env, "INSERT INTO meta (key, value) VALUES ('sheets_synced_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", ctx.now().toISOString());
  return { synced: data.length };
}
