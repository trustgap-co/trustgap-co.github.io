// TrustGap Worker — GENERATED FILE, do not edit by hand.
// Built from worker/src/ with `npm run dashboard-files`. Paste ALL of it into
// Cloudflare → Workers & Pages → trustgap-api → Edit code, replacing what is there, then Deploy.
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/lib/http.js
var UserError = class extends Error {
  static {
    __name(this, "UserError");
  }
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
};
var notFound = /* @__PURE__ */ __name((what = "Not found") => new UserError(what, 404), "notFound");
function corsHeaders(env, request) {
  const origin = request.headers.get("Origin");
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
var json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
}), "json");
var redirect = /* @__PURE__ */ __name((url) => new Response(null, { status: 302, headers: { Location: url } }), "redirect");
var html = /* @__PURE__ */ __name((body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }), "html");
var Router = class {
  static {
    __name(this, "Router");
  }
  constructor() {
    this.routes = [];
  }
  add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
    this.routes.push({ method, re, keys, handler });
  }
  get(p, h) {
    this.add("GET", p, h);
  }
  post(p, h) {
    this.add("POST", p, h);
  }
  match(method, path) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
};
async function readBody(request) {
  const type = request.headers.get("Content-Type") || "";
  if (type.includes("application/json")) return request.json().catch(() => ({}));
  if (type.includes("form")) return Object.fromEntries(await request.formData());
  return {};
}
__name(readBody, "readBody");

// src/config.js
function loadConfig(env) {
  const num = /* @__PURE__ */ __name((v, d) => v === void 0 || v === "" ? d : Number(v), "num");
  const testMode = env.TEST_MODE !== "false";
  if (!env.APP_SECRET && !testMode) throw new Error("APP_SECRET must be set when TEST_MODE is false");
  return {
    testMode,
    appSecret: env.APP_SECRET || "dev-only-insecure-secret",
    adminPassword: env.ADMIN_PASSWORD || (testMode ? "admin" : ""),
    siteUrl: String(env.SITE_URL || "http://localhost:8080").replace(/\/$/, ""),
    apiUrl: String(env.API_URL || "http://localhost:8787").replace(/\/$/, ""),
    paymentProvider: env.PAYMENT_PROVIDER || "mock",
    logisticsProvider: env.LOGISTICS_PROVIDER || "manual",
    identityProvider: env.IDENTITY_PROVIDER || "mock",
    requireSellerId: env.REQUIRE_SELLER_ID !== "false",
    // TrustGap fee (no cap) and the "Payment processing" line that passes Flutterwave's costs on.
    fee: {
      percent: num(env.FEE_PERCENT, 1.5),
      minKobo: num(env.FEE_MIN_NAIRA, 100) * 100
    },
    processing: {
      percent: num(env.PROCESSING_PERCENT, 2),
      // Flutterwave's charge on local NGN collections
      payoutFeeKobo: Math.round(num(env.PAYOUT_FEE_NAIRA, 57.79) * 100)
      // ₦53.75 transfer fee + 7.5% VAT (worst case)
    },
    // Flutterwave settles collections into the wallet T+1, so seller payouts wait this long after payment.
    settlementHours: num(env.SETTLEMENT_HOURS, 24),
    maxTransferAttempts: 3,
    maxIdentityAttempts: 3,
    maxDealKobo: num(env.MAX_DEAL_NAIRA, 3e5) * 100,
    inspectionHours: num(env.INSPECTION_HOURS, 24),
    paymentTimeoutMinutes: num(env.PAYMENT_TIMEOUT_MINUTES, 60),
    pinMaxAttempts: 5,
    otp: { ttlMinutes: 10, maxAttempts: 5, maxPerWindow: 3, windowMinutes: 15 },
    sessionDays: 30,
    riderLinkDays: 14
  };
}
__name(loadConfig, "loadConfig");

// src/lib/db.js
var norm = /* @__PURE__ */ __name((v) => v === void 0 ? null : typeof v === "boolean" ? Number(v) : v, "norm");
var stmt = /* @__PURE__ */ __name((env, sql, ...args) => env.DB.prepare(sql).bind(...args.map(norm)), "stmt");
var first = /* @__PURE__ */ __name((env, sql, ...args) => stmt(env, sql, ...args).first(), "first");
var all = /* @__PURE__ */ __name(async (env, sql, ...args) => (await stmt(env, sql, ...args).all()).results, "all");
var run = /* @__PURE__ */ __name((env, sql, ...args) => stmt(env, sql, ...args).run(), "run");
function insertStmt(env, table, row) {
  const keys = Object.keys(row);
  return stmt(env, `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, ...keys.map((k) => row[k]));
}
__name(insertStmt, "insertStmt");
async function insert(env, table, row) {
  return (await insertStmt(env, table, row).run()).meta.last_row_id;
}
__name(insert, "insert");
function updateStmt(env, table, id, fields) {
  const keys = Object.keys(fields);
  return stmt(env, `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => fields[k]), id);
}
__name(updateStmt, "updateStmt");
var update = /* @__PURE__ */ __name((env, table, id, fields) => updateStmt(env, table, id, fields).run(), "update");
function guardedInsert(env, table, row, guard) {
  const keys = Object.keys(row);
  return stmt(env, `INSERT INTO ${table} (${keys.join(", ")}) SELECT ${keys.map(() => "?").join(", ")} WHERE ${guard}`, ...keys.map((k) => row[k]));
}
__name(guardedInsert, "guardedInsert");

// src/providers/payments/banks.js
var NIGERIAN_BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "023", name: "Citibank Nigeria" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank" },
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "030", name: "Heritage Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "50211", name: "Kuda Microfinance Bank" },
  { code: "50515", name: "Moniepoint Microfinance Bank" },
  { code: "999992", name: "OPay" },
  { code: "999991", name: "PalmPay" },
  { code: "076", name: "Polaris Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "232", name: "Sterling Bank" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank for Africa" },
  { code: "215", name: "Unity Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" }
];

// src/providers/payments/mock.js
var MOCK_ACCOUNTS = {
  "0000000001": "ADEBAYO OLUWASEUN JOHN",
  "0000000002": "CHIOMA NGOZI OKAFOR",
  "0000000003": "MUSA IBRAHIM BELLO",
  "0000000004": "FUNMILAYO GRACE ADEYEMI",
  "0000000005": "EMEKA PETER NWOSU"
};
function createMockPayments(ctx) {
  const { env, config } = ctx;
  return {
    name: "mock",
    isTest: true,
    async listBanks() {
      return NIGERIAN_BANKS;
    },
    async resolveAccount({ accountNumber }) {
      const accountName = MOCK_ACCOUNTS[accountNumber];
      if (!accountName) throw new Error("Account not found. In test mode use one of the test account numbers.");
      return { accountName };
    },
    async createCheckout({ order }) {
      await run(env, "DELETE FROM mock_transactions WHERE tx_ref = ?", order.tx_ref);
      await insert(env, "mock_transactions", {
        tx_ref: order.tx_ref,
        amount: order.amount,
        status: "pending",
        created_at: ctx.now().toISOString()
      });
      return { url: `${config.apiUrl}/mock/pay/${encodeURIComponent(order.tx_ref)}` };
    },
    async verify(txRef) {
      const tx = await first(env, "SELECT * FROM mock_transactions WHERE tx_ref = ?", txRef);
      if (!tx) return { status: "not_found" };
      return { status: tx.status, amount: tx.amount, currency: "NGN", providerTxId: "mock-" + txRef };
    },
    async setMockStatus(txRef, status) {
      await run(env, "UPDATE mock_transactions SET status = ? WHERE tx_ref = ?", status, txRef);
    },
    async parseWebhook() {
      return null;
    },
    async verifyTransfer() {
      return { status: "success" };
    },
    async transfer({ reference }) {
      return { status: "success", providerRef: "mock-transfer-" + reference };
    }
  };
}
__name(createMockPayments, "createMockPayments");

// src/lib/crypto.js
var enc = new TextEncoder();
var dec = new TextDecoder();
var b64url = /* @__PURE__ */ __name((bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64url");
var fromB64url = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)), "fromB64url");
var randomToken = /* @__PURE__ */ __name((bytes = 18) => b64url(crypto.getRandomValues(new Uint8Array(bytes))), "randomToken");
function randomDigits(n) {
  const bytes = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(bytes, (b) => b % 10).join("");
}
__name(randomDigits, "randomDigits");
var REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function humanRef(prefix, length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return `${prefix}-${Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("")}`;
}
__name(humanRef, "humanRef");
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
__name(hmacKey, "hmacKey");
async function hmac(secret, message) {
  return b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(message)));
}
__name(hmac, "hmac");
function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
async function signLink(secret, data, expiresAt) {
  const body = `${data}.${Math.floor(expiresAt.getTime() / 1e3)}`;
  return `${body}.${await hmac(secret, "link:" + body)}`;
}
__name(signLink, "signLink");
async function verifyLink(secret, token, now) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [data, exp, sig] = parts;
  if (!safeEqual(sig, await hmac(secret, `link:${data}.${exp}`))) return null;
  if (Number(exp) * 1e3 < now.getTime()) return null;
  return data;
}
__name(verifyLink, "verifyLink");
async function aesKey(secret) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("trustgap-encryption:" + secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
__name(aesKey, "aesKey");
async function encrypt(plaintext, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(String(plaintext)));
  return `${b64url(iv)}.${b64url(data)}`;
}
__name(encrypt, "encrypt");
async function decrypt(payload, secret) {
  const [iv, data] = String(payload).split(".").map(fromB64url);
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await aesKey(secret), data));
}
__name(decrypt, "decrypt");

// src/providers/payments/flutterwave.js
function createFlutterwavePayments(ctx) {
  const { env, config } = ctx;
  const secretKey = env.FLW_SECRET_KEY || "";
  if (!secretKey) throw new Error("FLW_SECRET_KEY is required when PAYMENT_PROVIDER=flutterwave");
  const isTest = secretKey.startsWith("FLWSECK_TEST");
  if (!isTest && env.ALLOW_LIVE_PAYMENTS !== "true") {
    throw new Error("Live Flutterwave key detected. Set ALLOW_LIVE_PAYMENTS=true only after custody is approved.");
  }
  const apiBase = env.FLW_API_BASE || "https://api.flutterwave.com/v3";
  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(apiBase + path, {
        method,
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : void 0
      });
    } catch (err) {
      throw Object.assign(new Error(`Flutterwave unreachable: ${err.message}`), { definite: false });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === "error") {
      const message = data.message || String(res.status);
      throw Object.assign(new Error(`Flutterwave ${method} ${path} failed: ${message}`), {
        definite: res.status < 500,
        duplicate: /already exist|duplicate/i.test(message)
      });
    }
    return data.data;
  }
  __name(call, "call");
  return {
    name: "flutterwave",
    isTest,
    async listBanks() {
      try {
        const data = await call("GET", "/banks/NG");
        return data.map((b) => ({ code: b.code, name: b.name })).sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        return NIGERIAN_BANKS;
      }
    },
    async resolveAccount({ bankCode, accountNumber }) {
      const data = await call("POST", "/accounts/resolve", { account_number: accountNumber, account_bank: bankCode });
      return { accountName: data.account_name };
    },
    async createCheckout({ order, title }) {
      const data = await call("POST", "/payments", {
        tx_ref: order.tx_ref,
        amount: order.amount / 100,
        currency: "NGN",
        redirect_url: `${config.apiUrl}/api/payments/callback`,
        customer: { email: order.buyer_email, phonenumber: order.buyer_phone, name: order.buyer_name },
        customizations: { title: "TrustGap", description: title },
        meta: { order_ref: order.ref },
        session_duration: config.paymentTimeoutMinutes,
        max_retry_attempt: 3
      });
      return { url: data.link };
    },
    async verify(txRef) {
      try {
        const data = await call("GET", `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
        return {
          status: data.status === "successful" ? "successful" : data.status === "failed" ? "failed" : "pending",
          amount: Math.round(Number(data.amount) * 100),
          currency: data.currency,
          providerTxId: String(data.id)
        };
      } catch {
        return { status: "not_found" };
      }
    },
    // Tells the Worker what to re-check. The webhook body itself is never trusted: payments and
    // transfers are always confirmed with Flutterwave's API before anything changes.
    async parseWebhook(request, body) {
      const hash = env.FLW_WEBHOOK_HASH;
      if (!hash || !safeEqual(request.headers.get("verif-hash") || "", hash)) return null;
      const event = String(body?.event || body?.["event.type"] || "");
      const data = body?.data || {};
      if (event.startsWith("transfer") || data.account_number !== void 0) {
        return data.reference ? { kind: "transfer", reference: data.reference, providerRef: String(data.id || "") } : null;
      }
      return data.tx_ref ? { kind: "charge", txRef: data.tx_ref } : null;
    },
    async verifyTransfer({ providerRef }) {
      if (!providerRef) return { status: "pending" };
      try {
        const data = await call("GET", `/transfers/${encodeURIComponent(providerRef)}`);
        const st = String(data.status).toUpperCase();
        return {
          status: st === "SUCCESSFUL" ? "success" : st === "FAILED" ? "failed" : "pending",
          reason: data.complete_message,
          providerRef: String(data.id)
        };
      } catch {
        return { status: "pending" };
      }
    },
    async transfer({ amount, bankCode, accountNumber, narration, reference }) {
      const data = await call("POST", "/transfers", {
        account_bank: bankCode,
        account_number: accountNumber,
        amount: amount / 100,
        currency: "NGN",
        debit_currency: "NGN",
        narration,
        reference
      });
      return { status: "submitted", providerRef: String(data.id) };
    }
  };
}
__name(createFlutterwavePayments, "createFlutterwavePayments");

// src/providers/identity/mock.js
var MOCK_IDS = {
  "11111111111": { firstName: "ADEBAYO", middleName: "OLUWASEUN", lastName: "JOHN", dob: "1990-01-15" },
  "22222222222": { firstName: "CHIOMA", middleName: "NGOZI", lastName: "OKAFOR", dob: "1994-06-02" },
  "33333333333": { firstName: "MUSA", middleName: "IBRAHIM", lastName: "BELLO", dob: "1988-11-30" }
};
function createMockIdentity() {
  return {
    name: "mock",
    async verify({ idNumber }) {
      const person = MOCK_IDS[idNumber];
      if (!person) throw new Error("No record found for that number. In test mode use a test NIN.");
      return { ...person, providerRef: "mock-" + idNumber.slice(-4) };
    }
  };
}
__name(createMockIdentity, "createMockIdentity");

// src/providers/identity/monnify.js
var MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
function parseMonnifyDate(value) {
  const s = String(value || "").trim();
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
__name(parseMonnifyDate, "parseMonnifyDate");
var cachedToken = null;
function createMonnifyIdentity({ env, now }) {
  const apiKey = env.MONNIFY_API_KEY;
  const secretKey = env.MONNIFY_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error("MONNIFY_API_KEY and MONNIFY_SECRET_KEY are required when IDENTITY_PROVIDER=monnify");
  const base = String(env.MONNIFY_BASE_URL || "https://api.monnify.com").replace(/\/$/, "");
  const fail = /* @__PURE__ */ __name((message, retryable) => Object.assign(new Error(message), { retryable }), "fail");
  async function request(path, init) {
    let res;
    try {
      res = await fetch(base + path, init);
    } catch {
      throw fail("The identity service could not be reached. Please try again in a few minutes.", true);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.requestSuccessful === false || body.responseCode !== void 0 && String(body.responseCode) !== "0") {
      const message = body.responseMessage || `Identity service error (${res.status})`;
      throw fail(message, res.status >= 500 || /unavailable|timeout|try again/i.test(message));
    }
    return body.responseBody;
  }
  __name(request, "request");
  async function token() {
    const key = `${base}|${apiKey}`;
    if (cachedToken?.key === key && cachedToken.expiresAt > now().getTime() + 6e4) return cachedToken.token;
    const data = await request("/api/v1/auth/login", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${apiKey}:${secretKey}`)}` }
    });
    cachedToken = { key, token: data.accessToken, expiresAt: now().getTime() + Number(data.expiresIn || 3e3) * 1e3 };
    return cachedToken.token;
  }
  __name(token, "token");
  return {
    name: "monnify",
    async verify({ idNumber }) {
      const data = await request("/api/v1/vas/nin-verification", {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ nin: idNumber })
      });
      return {
        firstName: data.firstName || "",
        middleName: data.middleName || "",
        lastName: data.lastName || "",
        dob: parseMonnifyDate(data.dateOfBirth),
        phone: data.phoneNumber || "",
        providerRef: `monnify-nin-${idNumber.slice(-4)}`
      };
    }
  };
}
__name(createMonnifyIdentity, "createMonnifyIdentity");

// src/providers/logistics/manual.js
function createManualLogistics(ctx) {
  return {
    name: "manual",
    async book({ order }) {
      const expires = new Date(ctx.now().getTime() + ctx.config.riderLinkDays * 864e5);
      const token = await signLink(ctx.config.appSecret, `rider-${order.id}`, expires);
      return { deliveryRef: "MAN-" + order.ref, riderUrl: `${ctx.config.siteUrl}/rider.html?t=${encodeURIComponent(token)}` };
    }
  };
}
__name(createManualLogistics, "createManualLogistics");

// src/providers/logistics/fez.js
function createFezLogistics() {
  return {
    name: "fez",
    async book() {
      throw new Error("Fez integration is not configured yet. Use LOGISTICS_PROVIDER=manual for the pilot.");
    }
  };
}
__name(createFezLogistics, "createFezLogistics");

// src/providers/notify/make.js
function createNotifier(ctx) {
  return {
    async send({ orderId = null, event, phone = null, email = null, sms, emailSubject = null }) {
      const id = await insert(ctx.env, "outbox", {
        order_id: orderId,
        event,
        to_phone: phone,
        to_email: email,
        sms,
        email_subject: emailSubject,
        status: "pending",
        created_at: ctx.now().toISOString()
      });
      ctx.waitUntil(deliver(ctx, id));
      return id;
    }
  };
}
__name(createNotifier, "createNotifier");
async function deliver(ctx, id) {
  const { env } = ctx;
  if (!env.MAKE_WEBHOOK_URL) {
    await update(env, "outbox", id, { status: "logged" });
    return;
  }
  const claim = await run(env, "UPDATE outbox SET status = 'sending' WHERE id = ? AND status IN ('pending', 'failed')", id);
  if (claim.meta.changes !== 1) return;
  const row = await first(env, "SELECT * FROM outbox WHERE id = ?", id);
  const order = row.order_id ? await first(env, "SELECT ref FROM orders WHERE id = ?", row.order_id) : null;
  const body = JSON.stringify({
    id: row.id,
    event: row.event,
    to_phone: row.to_phone,
    // +2348031234567
    to_phone_intl: row.to_phone ? row.to_phone.replace(/^\+/, "") : null,
    // 2348031234567 (KudiSMS format)
    to_email: row.to_email,
    sms: row.sms,
    email_subject: row.email_subject || "TrustGap",
    email_body: row.sms,
    order_ref: order?.ref || null,
    sent_at: ctx.now().toISOString()
  });
  try {
    const res = await fetch(env.MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Lets your Make scenario check the message really came from your Worker.
        ...env.MAKE_WEBHOOK_SECRET ? { "X-TrustGap-Signature": await hmac(env.MAKE_WEBHOOK_SECRET, body) } : {}
      },
      body
    });
    if (!res.ok) throw new Error(`Make.com responded ${res.status}`);
    await update(env, "outbox", id, { status: "sent", attempts: row.attempts + 1, last_error: null });
  } catch (err) {
    await update(env, "outbox", id, { status: "failed", attempts: row.attempts + 1, last_error: String(err.message).slice(0, 300) });
  }
}
__name(deliver, "deliver");

// src/context.js
var pick = /* @__PURE__ */ __name((name, options, kind) => {
  const make = options[name];
  if (!make) throw new Error(`Unknown ${kind}: ${name}`);
  return make;
}, "pick");
function createContext(env, execCtx) {
  const ctx = {
    env,
    config: loadConfig(env),
    // Tests inject a controllable clock through env.__clock.
    now: env.__clock || (() => /* @__PURE__ */ new Date()),
    waitUntil: /* @__PURE__ */ __name((promise) => execCtx?.waitUntil ? execCtx.waitUntil(promise) : promise, "waitUntil")
  };
  ctx.payments = pick(ctx.config.paymentProvider, { mock: createMockPayments, flutterwave: createFlutterwavePayments }, "PAYMENT_PROVIDER")(ctx);
  ctx.identity = pick(ctx.config.identityProvider, { mock: createMockIdentity, monnify: createMonnifyIdentity }, "IDENTITY_PROVIDER")(ctx);
  ctx.logistics = pick(ctx.config.logisticsProvider, { manual: createManualLogistics, fez: createFezLogistics }, "LOGISTICS_PROVIDER")(ctx);
  ctx.notify = createNotifier(ctx);
  return ctx;
}
__name(createContext, "createContext");

// src/lib/money.js
function nairaToKobo(input) {
  const s = String(input ?? "").replace(/[,\s₦]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
__name(nairaToKobo, "nairaToKobo");
function formatNaira(kobo) {
  const naira2 = kobo / 100;
  return "\u20A6" + naira2.toLocaleString("en-NG", {
    minimumFractionDigits: kobo % 100 ? 2 : 0,
    maximumFractionDigits: 2
  });
}
__name(formatNaira, "formatNaira");
function platformFee(itemPriceKobo, fee) {
  return Math.max(fee.minKobo, Math.round(itemPriceKobo * fee.percent / 100));
}
__name(platformFee, "platformFee");
var ceilNaira = /* @__PURE__ */ __name((kobo) => Math.ceil(kobo / 100) * 100, "ceilNaira");
function processingFee({ itemPrice, buyerDelivery, platform, buyerShare }, processing) {
  const r = processing.percent / 100;
  return ceilNaira((r * (itemPrice + buyerDelivery + buyerShare * platform) + processing.payoutFeeKobo) / (1 - r * buyerShare));
}
__name(processingFee, "processingFee");
function splitCharges({ itemPrice, deliveryFee, deliveryPayer, feePayer, platformFee: pf, processingFee: pr }) {
  const buyerDelivery = deliveryPayer === "buyer" ? deliveryFee : 0;
  const share = /* @__PURE__ */ __name((amount) => feePayer === "buyer" ? amount : feePayer === "split" ? Math.ceil(amount / 2) : 0, "share");
  const buyerPlatformShare = share(pf);
  const buyerProcessingShare = share(pr);
  const buyerFeeShare = buyerPlatformShare + buyerProcessingShare;
  return {
    itemPrice,
    deliveryFee,
    platformFee: pf,
    processingFee: pr,
    buyerPlatformShare,
    buyerProcessingShare,
    buyerFeeShare,
    sellerFeeShare: pf + pr - buyerFeeShare,
    buyerDelivery,
    sellerDelivery: deliveryFee - buyerDelivery,
    buyerTotal: itemPrice + buyerDelivery + buyerFeeShare,
    sellerPayout: itemPrice - (deliveryFee - buyerDelivery) - (pf + pr - buyerFeeShare)
  };
}
__name(splitCharges, "splitCharges");
function quote({ itemPrice, deliveryFee, deliveryPayer, feePayer }, fee, processing) {
  const buyerShare = feePayer === "buyer" ? 1 : feePayer === "split" ? 0.5 : 0;
  const buyerDelivery = deliveryPayer === "buyer" ? deliveryFee : 0;
  const pf = platformFee(itemPrice, fee);
  const pr = processingFee({ itemPrice, buyerDelivery, platform: pf, buyerShare }, processing);
  return splitCharges({ itemPrice, deliveryFee, deliveryPayer, feePayer, platformFee: pf, processingFee: pr });
}
__name(quote, "quote");

// src/lib/zones.js
var ZONES = [
  { id: "ikeja", name: "Ikeja / Maryland / Ojota / Ogba", group: "mainland" },
  { id: "yaba", name: "Yaba / Surulere / Ebute-Metta / Mushin", group: "mainland" },
  { id: "gbagada", name: "Gbagada / Anthony / Ketu / Magodo", group: "mainland" },
  { id: "festac", name: "Festac / Amuwo-Odofin / Mile 2 / Satellite Town", group: "mainland" },
  { id: "ikotun", name: "Ikotun / Egbeda / Idimu / Alimosho", group: "outer" },
  { id: "ikorodu", name: "Ikorodu", group: "outer" },
  { id: "island", name: "Lagos Island / Ikoyi / Victoria Island", group: "island" },
  { id: "lekki", name: "Lekki Phase 1 / Oniru / Ikate / Chevron", group: "island" },
  { id: "ajah", name: "Ajah / Sangotedo / Abraham Adesanya", group: "far_island" }
];
var NAIRA = {
  mainland: { mainland: 2500, outer: 3500, island: 3500, far_island: 4500 },
  outer: { mainland: 3500, outer: 3500, island: 4500, far_island: 5500 },
  island: { mainland: 3500, outer: 4500, island: 2500, far_island: 3500 },
  far_island: { mainland: 4500, outer: 5500, island: 3500, far_island: 3e3 }
};
var zoneById = /* @__PURE__ */ __name((id) => ZONES.find((z) => z.id === id) || null, "zoneById");
function deliveryFeeKobo(fromZoneId, toZoneId) {
  const from = zoneById(fromZoneId);
  const to = zoneById(toZoneId);
  if (!from || !to) return null;
  return NAIRA[from.group][to.group] * 100;
}
__name(deliveryFeeKobo, "deliveryFeeKobo");

// src/lib/terms.js
var TERMS_VERSION = "2026-10-pilot-1";
var RULES = /* @__PURE__ */ __name((deal) => [
  "Your payment is held by TrustGap. The seller is not paid until the item is delivered and the inspection period ends.",
  "Check the item at the door. Only give the rider your 4-digit delivery PIN if it matches this description.",
  `After delivery you have ${deal.inspection_hours} hours to report a hidden problem. If you report nothing, the seller is paid automatically.`,
  `If the seller does not hand the item to the courier within ${deal.delivery_days} day(s), you get a full refund.`,
  "Wrong, fake, damaged or not-as-described item: the item goes back to the seller and you get a full refund.",
  "If you refuse a correct item, the cost of delivery and return may be deducted from your refund. Every deduction is shown to you in writing.",
  "Disputes are decided by TrustGap staff using evidence from both sides and the courier. You can appeal once by replying to the decision."
], "RULES");
async function snapshotTerms(deal, seller) {
  const terms = {
    version: TERMS_VERSION,
    deal_token: deal.token,
    seller: { business_name: seller.business_name, identity_verified: Boolean(seller.identity_verified_at) },
    item: {
      title: deal.item_title,
      description: deal.item_description,
      condition: deal.item_condition,
      quantity: deal.quantity
    },
    money: {
      item_price: deal.item_price,
      delivery_fee: deal.delivery_fee,
      delivery_payer: deal.delivery_payer,
      platform_fee: deal.platform_fee,
      processing_fee: deal.processing_fee,
      fee_payer: deal.fee_payer,
      buyer_total: deal.buyer_total
    },
    delivery: { area: zoneById(deal.delivery_zone)?.name || deal.delivery_zone, ship_within_days: deal.delivery_days },
    inspection_hours: deal.inspection_hours,
    rules: RULES(deal)
  };
  const json2 = JSON.stringify(terms);
  return { json: json2, hash: await sha256Hex(json2) };
}
__name(snapshotTerms, "snapshotTerms");

// src/core/common.js
var CONDITIONS = ["Brand new (sealed)", "Brand new (open box)", "Used - like new", "Used - good condition", "Used - fair condition"];
var EXPIRY_OPTIONS = [1, 6, 24, 72];
var BUYER_DISPUTE_CATEGORIES = {
  not_delivered: "Item not delivered",
  wrong_item: "Wrong item sent",
  damaged: "Item damaged",
  not_as_described: "Not as described",
  counterfeit: "Item is fake",
  changed_mind: "I changed my mind",
  other: "Something else"
};
var DISPUTE_CATEGORIES = {
  ...BUYER_DISPUTE_CATEGORIES,
  refused_at_door: "Refused at the door",
  not_shipped: "Seller did not ship in time",
  seller_issue: "Raised by seller"
};
var HELD_STATUSES = ["paid", "shipping", "delivered", "disputed"];
var HOUR = 36e5;
var iso = /* @__PURE__ */ __name((d) => d.toISOString(), "iso");
var addHours = /* @__PURE__ */ __name((d, h) => new Date(d.getTime() + h * HOUR), "addHours");
var str = /* @__PURE__ */ __name((v) => String(v ?? "").trim(), "str");
function requireLength(value, label, min, max) {
  const v = str(value);
  if (v.length < min) throw new UserError(`${label} is too short.`);
  if (v.length > max) throw new UserError(`${label} is too long (max ${max} characters).`);
  return v;
}
__name(requireLength, "requireLength");
function normalisePhone(input) {
  const digits = str(input).replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+?234|0)([789][01]\d{8})$/);
  if (m) return "+234" + m[1];
  throw new UserError("Enter a valid Nigerian phone number, e.g. 0803 123 4567.");
}
__name(normalisePhone, "normalisePhone");
function validEmail(input) {
  const email = str(input).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new UserError("Enter a valid email address.");
  return email;
}
__name(validEmail, "validEmail");
var getSeller = /* @__PURE__ */ __name((ctx, id) => first(ctx.env, "SELECT * FROM sellers WHERE id = ?", id), "getSeller");
var getDeal = /* @__PURE__ */ __name((ctx, id) => first(ctx.env, "SELECT * FROM deals WHERE id = ?", id), "getDeal");
var getOrder = /* @__PURE__ */ __name((ctx, id) => first(ctx.env, "SELECT * FROM orders WHERE id = ?", id), "getOrder");
var trackUrl = /* @__PURE__ */ __name((ctx, order) => `${ctx.config.siteUrl}/track.html?t=${order.buyer_token}`, "trackUrl");
var payUrl = /* @__PURE__ */ __name((ctx, deal) => `${ctx.config.siteUrl}/pay.html?d=${deal.token}`, "payUrl");
var detailText = /* @__PURE__ */ __name((d) => d == null ? null : typeof d === "string" ? d : JSON.stringify(d), "detailText");
var eventStmt = /* @__PURE__ */ __name((ctx, orderId, actor, type, detail = null) => insertStmt(ctx.env, "order_events", { order_id: orderId, actor, type, detail: detailText(detail), created_at: iso(ctx.now()) }), "eventStmt");
var logEvent = /* @__PURE__ */ __name((ctx, ...args) => eventStmt(ctx, ...args).run(), "logEvent");
var ledgerRow = /* @__PURE__ */ __name((ctx, orderId, kind, amount, counterparty, status, notBefore = null) => ({
  order_id: orderId,
  kind,
  amount,
  counterparty,
  status,
  not_before: notBefore,
  created_at: iso(ctx.now())
}), "ledgerRow");
function settlesAt(ctx, paidAt) {
  const t = new Date(new Date(paidAt).getTime() + ctx.config.settlementHours * HOUR);
  const day = new Date(t.getTime() + HOUR).getUTCDay();
  if (day === 6) return new Date(t.getTime() + 48 * HOUR);
  if (day === 0) return new Date(t.getTime() + 24 * HOUR);
  return t;
}
__name(settlesAt, "settlesAt");
async function transition(ctx, orderId, from, fields, followUps = () => []) {
  const nonce = randomToken(12);
  const set = { ...fields, last_transition: nonce };
  const keys = Object.keys(set);
  const cas = stmt(
    ctx.env,
    `UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`,
    ...keys.map((k) => set[k]),
    orderId,
    ...from
  );
  const guard = `EXISTS (SELECT 1 FROM orders WHERE id = ${Number(orderId)} AND last_transition = '${nonce}')`;
  const helpers = {
    guard,
    insert: /* @__PURE__ */ __name((table, row) => guardedInsert(ctx.env, table, row, guard), "insert"),
    event: /* @__PURE__ */ __name((actor, type, detail) => guardedInsert(ctx.env, "order_events", { order_id: orderId, actor, type, detail: detailText(detail), created_at: iso(ctx.now()) }, guard), "event"),
    sql: /* @__PURE__ */ __name((sql, ...args) => stmt(ctx.env, `${sql} AND ${guard}`, ...args), "sql")
  };
  const results = await ctx.env.DB.batch([cas, ...followUps(helpers)]);
  return results[0].meta.changes === 1;
}
__name(transition, "transition");
function fmtDate(d) {
  return new Date(d).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}
__name(fmtDate, "fmtDate");

// src/core/deals.js
async function createDeal(ctx, seller, input) {
  if (seller.suspended_at) throw new UserError("Your account is suspended. Contact support.");
  if (!seller.payout_verified_at) throw new UserError("Add and verify your payout bank account before creating links.");
  if (ctx.config.requireSellerId && !seller.identity_verified_at) {
    throw new UserError("Verify your identity with your NIN before creating links.");
  }
  if (seller.amount_owed > 0) {
    throw new UserError(`You owe ${formatNaira(seller.amount_owed)} from a past dispute. Settle it before creating new links.`);
  }
  const itemTitle = requireLength(input.item_title, "Item name", 3, 120);
  const itemDescription = requireLength(input.item_description, "Description", 10, 1e3);
  const itemCondition = str(input.item_condition);
  if (!CONDITIONS.includes(itemCondition)) throw new UserError("Choose the item condition.");
  const quantity = Number(input.quantity || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new UserError("Quantity must be 1 to 100.");
  const itemPrice = nairaToKobo(input.item_price);
  if (itemPrice == null || itemPrice < 500 * 100) throw new UserError("Price must be at least \u20A6500.");
  if (itemPrice > ctx.config.maxDealKobo) {
    throw new UserError(`During the pilot, deals are limited to ${formatNaira(ctx.config.maxDealKobo)}.`);
  }
  const pickupAddress = requireLength(input.pickup_address, "Pickup address", 10, 300);
  const pickupZone = str(input.pickup_zone);
  const deliveryZone = str(input.delivery_zone);
  if (!zoneById(pickupZone)) throw new UserError("Choose your pickup area.");
  if (!zoneById(deliveryZone)) throw new UserError("Choose the buyer's delivery area.");
  const deliveryPayer = str(input.delivery_payer);
  const feePayer = str(input.fee_payer);
  if (!["buyer", "seller"].includes(deliveryPayer)) throw new UserError("Choose who pays for delivery.");
  if (!["buyer", "seller", "split"].includes(feePayer)) throw new UserError("Choose who pays the TrustGap fee.");
  const deliveryDays = Number(input.delivery_days || 2);
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1 || deliveryDays > 7) throw new UserError("Ship-within must be 1 to 7 days.");
  const expiresHours = Number(input.expires_hours || 24);
  if (!EXPIRY_OPTIONS.includes(expiresHours)) throw new UserError("Choose when the link expires.");
  const deliveryFee = deliveryFeeKobo(pickupZone, deliveryZone);
  const q = quote({ itemPrice, deliveryFee, deliveryPayer, feePayer }, ctx.config.fee, ctx.config.processing);
  if (q.sellerPayout <= 0) throw new UserError("After delivery and fees you would receive nothing. Adjust the price or who pays.");
  const now = ctx.now();
  const token = randomToken(12);
  const statements = [];
  let replacesId = null;
  if (input.replaces) {
    const old = await first(ctx.env, "SELECT * FROM deals WHERE id = ? AND seller_id = ?", Number(input.replaces), seller.id);
    if (old && old.status === "open") {
      replacesId = old.id;
      statements.push(stmt(ctx.env, "UPDATE deals SET status = 'replaced' WHERE id = ? AND status = 'open'", old.id));
    }
  }
  statements.push(
    insertStmt(ctx.env, "deals", {
      token,
      seller_id: seller.id,
      replaces_deal_id: replacesId,
      item_title: itemTitle,
      item_description: itemDescription,
      item_condition: itemCondition,
      quantity,
      item_price: itemPrice,
      pickup_address: pickupAddress,
      pickup_zone: pickupZone,
      delivery_zone: deliveryZone,
      delivery_fee: deliveryFee,
      delivery_payer: deliveryPayer,
      fee_payer: feePayer,
      platform_fee: q.platformFee,
      processing_fee: q.processingFee,
      buyer_total: q.buyerTotal,
      seller_payout: q.sellerPayout,
      delivery_days: deliveryDays,
      inspection_hours: ctx.config.inspectionHours,
      status: "open",
      expires_at: iso(addHours(now, expiresHours)),
      created_at: iso(now)
    }),
    updateStmt(ctx.env, "sellers", seller.id, { pickup_address: pickupAddress, pickup_zone: pickupZone })
  );
  await ctx.env.DB.batch(statements);
  return first(ctx.env, "SELECT * FROM deals WHERE token = ?", token);
}
__name(createDeal, "createDeal");
async function refreshDeal(ctx, deal) {
  if (deal && deal.status === "open" && new Date(deal.expires_at) <= ctx.now()) {
    await stmt(ctx.env, "UPDATE deals SET status = 'expired' WHERE id = ? AND status = 'open'", deal.id).run();
    return { ...deal, status: "expired" };
  }
  return deal;
}
__name(refreshDeal, "refreshDeal");
async function cancelDeal(ctx, seller, dealId) {
  const res = await stmt(ctx.env, "UPDATE deals SET status = 'cancelled' WHERE id = ? AND seller_id = ? AND status = 'open'", dealId, seller.id).run();
  if (res.meta.changes !== 1) throw new UserError("Only an unpaid, open link can be cancelled.");
}
__name(cancelDeal, "cancelDeal");
function priceBreakdown(deal) {
  return splitCharges({
    itemPrice: deal.item_price,
    deliveryFee: deal.delivery_fee,
    deliveryPayer: deal.delivery_payer,
    feePayer: deal.fee_payer,
    platformFee: deal.platform_fee,
    processingFee: deal.processing_fee
  });
}
__name(priceBreakdown, "priceBreakdown");
async function publicDealView(ctx, deal) {
  const seller = await getSeller(ctx, deal.seller_id);
  const q = priceBreakdown(deal);
  return {
    token: deal.token,
    status: deal.status,
    seller: { business_name: seller.business_name, identity_verified: Boolean(seller.identity_verified_at) },
    item_title: deal.item_title,
    item_description: deal.item_description,
    item_condition: deal.item_condition,
    quantity: deal.quantity,
    delivery_area: zoneById(deal.delivery_zone)?.name,
    delivery_days: deal.delivery_days,
    inspection_hours: deal.inspection_hours,
    expires_at: deal.expires_at,
    fee_payer: deal.fee_payer,
    price: {
      item: q.itemPrice,
      delivery: q.buyerDelivery,
      delivery_paid_by_seller: q.sellerDelivery > 0,
      platform_fee: q.buyerPlatformShare,
      processing_fee: q.buyerProcessingShare,
      fee_paid_by_seller: q.buyerFeeShare === 0,
      total: q.buyerTotal
    }
  };
}
__name(publicDealView, "publicDealView");

// src/lib/names.js
var tokens = /* @__PURE__ */ __name((name) => String(name || "").toUpperCase().replace(/[^A-Z\s-]/g, " ").split(/[\s-]+/).filter((t) => t.length > 1), "tokens");
function namesMatch(typedName, accountName) {
  const typed = tokens(typedName);
  const account = new Set(tokens(accountName));
  if (typed.length < 2 || account.size === 0) return false;
  const overlap = typed.filter((t) => account.has(t)).length;
  return overlap >= Math.min(2, account.size);
}
__name(namesMatch, "namesMatch");

// src/core/orders.js
async function startCheckout(ctx, deal) {
  deal = await refreshDeal(ctx, deal);
  if (deal.status !== "open") throw new UserError("This link is no longer available.", 410);
  const { json: json2, hash } = await snapshotTerms(deal, await getSeller(ctx, deal.seller_id));
  const id = randomToken(15);
  await insert(ctx.env, "checkouts", { id, deal_id: deal.id, terms_json: json2, terms_hash: hash, created_at: iso(ctx.now()) });
  return { checkout_id: id, terms_hash: hash };
}
__name(startCheckout, "startCheckout");
async function getCheckout(ctx, deal, checkoutId) {
  const c = await first(ctx.env, "SELECT * FROM checkouts WHERE id = ? AND deal_id = ?", str(checkoutId), deal.id);
  if (!c || new Date(c.created_at) < addHours(ctx.now(), -2)) {
    throw new UserError("Your review session expired. Go back to step 1 and confirm the deal again.", 409);
  }
  return c;
}
__name(getCheckout, "getCheckout");
async function placeOrder(ctx, { deal, input }) {
  const checkout = await getCheckout(ctx, deal, input.checkout_id);
  const buyerName = requireLength(input.buyer_name, "Full name", 3, 100);
  if (buyerName.split(/\s+/).length < 2) throw new UserError("Enter your full name (first and last name).");
  const buyerPhone = normalisePhone(input.buyer_phone);
  const buyerEmail = validEmail(input.buyer_email);
  const deliveryAddress = requireLength(input.delivery_address, "Delivery address", 10, 300);
  const deliveryLandmark = str(input.delivery_landmark).slice(0, 200);
  if (input.confirm_area !== true && input.confirm_area !== "yes") {
    throw new UserError("Confirm that your address is in the delivery area shown.");
  }
  const bankCode = str(input.refund_bank_code);
  const accountNumber = str(input.refund_account_number);
  if (!/^\d{10}$/.test(accountNumber)) throw new UserError("Refund account number must be 10 digits.");
  const bank = (await ctx.payments.listBanks()).find((b) => b.code === bankCode);
  if (!bank) throw new UserError("Choose the bank for refunds.");
  let accountName;
  try {
    ({ accountName } = await ctx.payments.resolveAccount({ bankCode, accountNumber }));
  } catch (err) {
    throw new UserError(`We could not confirm your refund account: ${err.message}`);
  }
  if (!namesMatch(buyerName, accountName)) {
    throw new UserError(
      `The refund account belongs to "${accountName}". Refunds can only go to an account in your own name \u2014 use your own account, or enter your name exactly as your bank has it.`
    );
  }
  const fresh = await refreshDeal(ctx, await getDeal(ctx, deal.id));
  if (fresh.status !== "open") throw new UserError("This link is no longer available.", 410);
  const id = await insert(ctx.env, "orders", {
    ref: humanRef("TG"),
    deal_id: deal.id,
    seller_id: deal.seller_id,
    buyer_token: randomToken(18),
    buyer_name: buyerName,
    buyer_phone: buyerPhone,
    buyer_email: buyerEmail,
    delivery_address: deliveryAddress,
    delivery_landmark: deliveryLandmark || null,
    refund_bank_code: bankCode,
    refund_bank_name: bank.name,
    refund_account_enc: await encrypt(accountNumber, ctx.config.appSecret),
    refund_account_last4: accountNumber.slice(-4),
    refund_account_name: accountName,
    terms_json: checkout.terms_json,
    terms_hash: checkout.terms_hash,
    terms_accepted_at: checkout.created_at,
    amount: deal.buyer_total,
    status: "awaiting_payment",
    tx_ref: "TGTX-" + randomToken(12),
    created_at: iso(ctx.now())
  });
  await logEvent(ctx, id, "buyer", "terms_accepted", { terms_hash: checkout.terms_hash });
  const order = await getOrder(ctx, id);
  const { url } = await ctx.payments.createCheckout({ order, title: deal.item_title });
  return { order, payment_url: url };
}
__name(placeOrder, "placeOrder");
async function retryPayment(ctx, order) {
  const deal = await refreshDeal(ctx, await getDeal(ctx, order.deal_id));
  if (!["awaiting_payment", "cancelled"].includes(order.status) || deal.status !== "open") {
    throw new UserError("This order can no longer be paid. Ask the seller for a new link.", 410);
  }
  await update(ctx.env, "orders", order.id, { tx_ref: "TGTX-" + randomToken(12), status: "awaiting_payment", closed_at: null });
  const fresh = await getOrder(ctx, order.id);
  const { url } = await ctx.payments.createCheckout({ order: fresh, title: deal.item_title });
  return { payment_url: url };
}
__name(retryPayment, "retryPayment");
async function confirmPayment(ctx, txRef, actor = "system") {
  const order = await first(ctx.env, "SELECT * FROM orders WHERE tx_ref = ?", str(txRef));
  if (!order) return null;
  if (!["awaiting_payment", "cancelled"].includes(order.status)) return order;
  const v = await ctx.payments.verify(order.tx_ref);
  if (v.status !== "successful") {
    if (v.status === "failed" && order.status === "awaiting_payment") await logEvent(ctx, order.id, actor, "payment_failed");
    return getOrder(ctx, order.id);
  }
  if (v.currency !== "NGN" || v.amount < order.amount) {
    await logEvent(ctx, order.id, actor, "payment_mismatch", { expected: order.amount, got: v.amount, currency: v.currency });
    return getOrder(ctx, order.id);
  }
  const deal = await getDeal(ctx, order.deal_id);
  const now = ctx.now();
  const alreadyPaid = await first(
    ctx.env,
    `SELECT id FROM orders WHERE deal_id = ? AND id != ? AND status IN ('paid','shipping','delivered','disputed','completed','refunded')`,
    deal.id,
    order.id
  );
  if (alreadyPaid) return refundDuplicate(ctx, order, v, actor);
  const pin = randomDigits(4);
  const shipBy = addHours(now, deal.delivery_days * 24);
  let won;
  try {
    won = await transition(
      ctx,
      order.id,
      ["awaiting_payment", "cancelled"],
      {
        status: "paid",
        provider_tx_id: v.providerTxId,
        paid_at: iso(now),
        closed_at: null,
        delivery_pin_enc: await encrypt(pin, ctx.config.appSecret),
        ship_by: iso(shipBy)
      },
      (h) => [
        h.sql("UPDATE deals SET status = 'paid' WHERE id = ?", deal.id),
        h.insert("ledger", ledgerRow(ctx, order.id, "collected", v.amount, "buyer", "success")),
        h.event(actor, "payment_received", { amount: v.amount })
      ]
    );
  } catch (err) {
    if (/UNIQUE/i.test(String(err.message))) return refundDuplicate(ctx, order, v, actor);
    throw err;
  }
  if (!won) return getOrder(ctx, order.id);
  const seller = await getSeller(ctx, deal.seller_id);
  await ctx.notify.send({
    orderId: order.id,
    event: "payment_received_seller",
    phone: seller.phone,
    email: seller.email,
    sms: `TrustGap: ${formatNaira(order.amount)} for "${deal.item_title}" is secured (order ${order.ref}). Pack the item and book pickup in your dashboard before ${fmtDate(shipBy)}.`,
    emailSubject: `Payment secured \u2014 order ${order.ref}`
  });
  await ctx.notify.send({
    orderId: order.id,
    event: "payment_received_buyer",
    phone: order.buyer_phone,
    email: order.buyer_email,
    sms: `TrustGap: payment received for "${deal.item_title}" (order ${order.ref}). Your money is held until delivery. Your delivery PIN is ${pin} \u2014 give it to the rider ONLY after checking the item. Track: ${trackUrl(ctx, order)}`,
    emailSubject: `Your TrustGap order ${order.ref}`
  });
  return getOrder(ctx, order.id);
}
__name(confirmPayment, "confirmPayment");
async function refundDuplicate(ctx, order, v, actor) {
  const now = ctx.now();
  const settles = iso(settlesAt(ctx, now));
  const won = await transition(
    ctx,
    order.id,
    ["awaiting_payment", "cancelled"],
    { status: "duplicate_refunded", provider_tx_id: v.providerTxId, paid_at: iso(now), closed_at: iso(now) },
    (h) => [
      h.insert("ledger", ledgerRow(ctx, order.id, "collected", v.amount, "buyer", "success")),
      h.insert("ledger", ledgerRow(ctx, order.id, "buyer_refund", v.amount, "buyer", "pending", settles)),
      h.event(actor, "duplicate_payment_refunded")
    ]
  );
  if (won) {
    await sendPendingTransfers(ctx, order.id);
    await ctx.notify.send({
      orderId: order.id,
      event: "duplicate_refund",
      phone: order.buyer_phone,
      email: order.buyer_email,
      sms: `TrustGap: this deal had already been paid for, so your payment of ${formatNaira(v.amount)} is being refunded in full to your ${order.refund_bank_name} account ending ${order.refund_account_last4}.`
    });
  }
  return getOrder(ctx, order.id);
}
__name(refundDuplicate, "refundDuplicate");
async function revealPin(ctx, order) {
  return order.delivery_pin_enc ? decrypt(order.delivery_pin_enc, ctx.config.appSecret) : null;
}
__name(revealPin, "revealPin");
async function bookPickup(ctx, seller, orderId, packingNote) {
  const order = await first(ctx.env, "SELECT * FROM orders WHERE id = ? AND seller_id = ?", orderId, seller.id);
  if (!order) throw new UserError("Order not found.", 404);
  const note = str(packingNote).slice(0, 500);
  if (note.length < 5) {
    throw new UserError("Add a short packing note (serial number, colour, what is in the box). It is your evidence if there is a dispute.");
  }
  const deal = await getDeal(ctx, order.deal_id);
  const won = await transition(ctx, order.id, ["paid"], {
    status: "shipping",
    delivery_status: "booking",
    packing_note: note,
    dispatched_at: iso(ctx.now())
  });
  if (!won) throw new UserError("Pickup can only be booked for a paid order that has not shipped.");
  let booking;
  try {
    booking = await ctx.logistics.book({ order: { ...order, packing_note: note }, deal, seller });
  } catch (err) {
    await update(ctx.env, "orders", order.id, { status: "paid", delivery_status: "not_booked", dispatched_at: null });
    throw new UserError(`Could not book the courier: ${err.message}`);
  }
  await ctx.env.DB.batch([
    stmt(ctx.env, "UPDATE orders SET delivery_status = 'booked', delivery_ref = ?, rider_url = ? WHERE id = ?", booking.deliveryRef, booking.riderUrl || null, order.id),
    stmt(
      ctx.env,
      "INSERT INTO ledger (order_id, kind, amount, counterparty, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      order.id,
      "delivery_cost",
      deal.delivery_fee,
      "courier",
      "pending",
      iso(ctx.now())
    )
  ]);
  await logEvent(ctx, order.id, "seller", "pickup_booked", { delivery_ref: booking.deliveryRef, packing_note: note });
  await ctx.notify.send({
    orderId: order.id,
    event: "pickup_booked",
    phone: order.buyer_phone,
    sms: `TrustGap: the seller has packed "${deal.item_title}" and pickup is booked (order ${order.ref}). Track: ${trackUrl(ctx, order)}`
  });
  return booking;
}
__name(bookPickup, "bookPickup");
var DELIVERY_STEPS = {
  picked_up: { from: ["booked"], label: "Picked up from seller" },
  out_for_delivery: { from: ["booked", "picked_up", "attempt_failed"], label: "Out for delivery" },
  attempt_failed: { from: ["picked_up", "out_for_delivery"], label: "Delivery attempt failed" },
  refused: { from: ["picked_up", "out_for_delivery", "attempt_failed"], label: "Refused by buyer at the door" },
  returned: { from: ["refused"], label: "Returned to seller" }
};
var DELIVERY_LABELS = {
  not_booked: "Not booked",
  booking: "Booking courier",
  booked: "Pickup booked",
  delivered: "Delivered",
  ...Object.fromEntries(Object.entries(DELIVERY_STEPS).map(([k, v]) => [k, v.label]))
};
async function applyDeliveryUpdate(ctx, order, { status, note, actor }) {
  const step = DELIVERY_STEPS[status];
  if (!step) throw new UserError("Unknown delivery update.");
  const reason = str(note).slice(0, 500);
  if (["attempt_failed", "refused"].includes(status) && reason.length < 3) throw new UserError("Say what happened.");
  const res = await stmt(
    ctx.env,
    `UPDATE orders SET delivery_status = ? WHERE id = ? AND delivery_status IN (${step.from.map(() => "?").join(", ")})`,
    status,
    order.id,
    ...step.from
  ).run();
  if (res.meta.changes !== 1) {
    throw new UserError(`Cannot mark "${step.label}" while the parcel is "${DELIVERY_LABELS[order.delivery_status] || order.delivery_status}".`);
  }
  await logEvent(ctx, order.id, actor, "delivery_" + status, reason || null);
  if (status === "refused") {
    await openDispute(ctx, await getOrder(ctx, order.id), { by: actor, category: "refused_at_door", description: reason });
  } else if (status === "out_for_delivery" || status === "attempt_failed") {
    await ctx.notify.send({
      orderId: order.id,
      event: "delivery_" + status,
      phone: order.buyer_phone,
      sms: status === "out_for_delivery" ? `TrustGap: order ${order.ref} is out for delivery. Check the item before you give the rider your PIN.` : `TrustGap: the rider could not deliver order ${order.ref} (${reason}). They will try again.`
    });
  }
}
__name(applyDeliveryUpdate, "applyDeliveryUpdate");
async function verifyDeliveryPin(ctx, order, pin, actor) {
  if (order.status !== "shipping") throw new UserError("This order is not out for delivery.");
  if (order.pin_attempts >= ctx.config.pinMaxAttempts) throw new UserError("Too many wrong PINs. Contact TrustGap support to continue.");
  if (!safeEqual(str(pin), await revealPin(ctx, order))) {
    await run(ctx.env, "UPDATE orders SET pin_attempts = pin_attempts + 1 WHERE id = ?", order.id);
    await logEvent(ctx, order.id, actor, "wrong_pin");
    throw new UserError(`Wrong PIN. ${ctx.config.pinMaxAttempts - order.pin_attempts - 1} attempt(s) left.`);
  }
  const deal = await getDeal(ctx, order.deal_id);
  const now = ctx.now();
  const ends = addHours(now, deal.inspection_hours);
  const won = await transition(
    ctx,
    order.id,
    ["shipping"],
    { status: "delivered", delivery_status: "delivered", delivered_at: iso(now), inspection_ends_at: iso(ends) },
    (h) => [
      h.sql("UPDATE ledger SET status = 'success' WHERE order_id = ? AND kind = 'delivery_cost'", order.id),
      h.event(actor, "delivered_with_pin")
    ]
  );
  if (!won) throw new UserError("This order was already updated.");
  const seller = await getSeller(ctx, order.seller_id);
  await ctx.notify.send({
    orderId: order.id,
    event: "delivered_buyer",
    phone: order.buyer_phone,
    sms: `TrustGap: order ${order.ref} delivered. If something is wrong, report it before ${fmtDate(ends)}: ${trackUrl(ctx, order)} \u2014 otherwise the seller is paid automatically.`
  });
  await ctx.notify.send({
    orderId: order.id,
    event: "delivered_seller",
    phone: seller.phone,
    sms: `TrustGap: order ${order.ref} was delivered. Your payout is released when the buyer confirms or at ${fmtDate(ends)}, unless they report a problem.`
  });
}
__name(verifyDeliveryPin, "verifyDeliveryPin");
async function openDispute(ctx, order, { by, category, description }) {
  if (!DISPUTE_CATEGORIES[category]) throw new UserError("Choose what went wrong.");
  const text = str(description).slice(0, 2e3);
  if (text.length < 3) throw new UserError("Describe the problem.");
  if (!["paid", "shipping", "delivered"].includes(order.status)) throw new UserError("A problem can no longer be reported on this order.");
  if (by === "buyer" && order.status === "delivered" && new Date(order.inspection_ends_at) <= ctx.now()) {
    throw new UserError("The inspection period has ended.");
  }
  const won = await transition(ctx, order.id, [order.status], { status: "disputed" }, (h) => [
    h.insert("disputes", { order_id: order.id, opened_by: by, category, description: text, status: "open", created_at: iso(ctx.now()) }),
    h.event(by, "dispute_opened", { category, description: text })
  ]);
  if (!won) throw new UserError("This order changed while you were reporting. Refresh and try again.", 409);
  const seller = await getSeller(ctx, order.seller_id);
  const sms = `TrustGap: a problem was reported on order ${order.ref} (${DISPUTE_CATEGORIES[category]}). The money stays held while we review. We may contact you for evidence.`;
  await ctx.notify.send({ orderId: order.id, event: "dispute_opened", phone: order.buyer_phone, sms });
  await ctx.notify.send({ orderId: order.id, event: "dispute_opened", phone: seller.phone, sms });
}
__name(openDispute, "openDispute");
async function resolveDispute(ctx, disputeId, input) {
  const dispute = await first(ctx.env, "SELECT * FROM disputes WHERE id = ?", disputeId);
  if (!dispute || dispute.status !== "open") throw new UserError("Dispute not found or already resolved.");
  const order = await getOrder(ctx, dispute.order_id);
  const buyerRefund = nairaToKobo(input.buyer_refund ?? "0");
  const sellerPayout = nairaToKobo(input.seller_payout ?? "0");
  const sellerCharge = nairaToKobo(input.seller_charge ?? "0");
  if ([buyerRefund, sellerPayout, sellerCharge].includes(null)) throw new UserError("Amounts must be numbers.");
  if (buyerRefund + sellerPayout > order.amount) {
    throw new UserError(`Refund plus payout cannot exceed the ${formatNaira(order.amount)} collected.`);
  }
  const note = requireLength(input.note, "Decision note", 10, 2e3);
  const now = iso(ctx.now());
  const retained = order.amount - buyerRefund - sellerPayout;
  const settles = iso(settlesAt(ctx, order.paid_at));
  const won = await transition(
    ctx,
    order.id,
    ["disputed"],
    { status: sellerPayout > 0 ? "completed" : "refunded", closed_at: now },
    (h) => [
      h.sql(
        "UPDATE disputes SET status = 'resolved', resolution_note = ?, buyer_refund = ?, seller_payout = ?, seller_charge = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
        note,
        buyerRefund,
        sellerPayout,
        sellerCharge,
        now,
        dispute.id
      ),
      h.sql("UPDATE sellers SET amount_owed = amount_owed + ? WHERE id = ?", sellerCharge, order.seller_id),
      h.sql("UPDATE ledger SET status = 'success' WHERE order_id = ? AND kind = 'delivery_cost'", order.id),
      ...buyerRefund > 0 ? [h.insert("ledger", ledgerRow(ctx, order.id, "buyer_refund", buyerRefund, "buyer", "pending", settles))] : [],
      ...sellerPayout > 0 ? [h.insert("ledger", ledgerRow(ctx, order.id, "seller_payout", sellerPayout, "seller", "pending", settles))] : [],
      ...retained > 0 ? [h.insert("ledger", ledgerRow(ctx, order.id, "platform_retained", retained, "trustgap", "success"))] : [],
      h.event("admin", "dispute_resolved", { buyerRefund, sellerPayout, sellerCharge, note })
    ]
  );
  if (!won) throw new UserError("This order was already decided.");
  await sendPendingTransfers(ctx, order.id);
  const seller = await getSeller(ctx, order.seller_id);
  const summary = `Refund to buyer: ${formatNaira(buyerRefund)}. Paid to seller: ${formatNaira(sellerPayout)}.${sellerCharge > 0 ? ` Charged to seller: ${formatNaira(sellerCharge)}.` : ""} Reason: ${note}`;
  await ctx.notify.send({ orderId: order.id, event: "dispute_resolved", phone: order.buyer_phone, email: order.buyer_email, sms: `TrustGap decision on ${order.ref}. ${summary}` });
  await ctx.notify.send({ orderId: order.id, event: "dispute_resolved", phone: seller.phone, email: seller.email, sms: `TrustGap decision on ${order.ref}. ${summary}` });
}
__name(resolveDispute, "resolveDispute");
async function releaseToSeller(ctx, order, reason) {
  if (order.status !== "delivered") throw new UserError("Payment can only be released after delivery.");
  const deal = await getDeal(ctx, order.deal_id);
  const seller = await getSeller(ctx, order.seller_id);
  const recovered = Math.min(seller.amount_owed, deal.seller_payout);
  const payout = deal.seller_payout - recovered;
  const settles = settlesAt(ctx, order.paid_at);
  const won = await transition(ctx, order.id, ["delivered"], { status: "completed", closed_at: iso(ctx.now()) }, (h) => [
    ...recovered > 0 ? [
      h.sql("UPDATE sellers SET amount_owed = amount_owed - ? WHERE id = ?", recovered, seller.id),
      h.insert("ledger", ledgerRow(ctx, order.id, "debt_recovered", recovered, "seller", "success"))
    ] : [],
    h.insert("ledger", ledgerRow(ctx, order.id, "platform_fee", deal.platform_fee, "trustgap", "success")),
    h.insert("ledger", ledgerRow(ctx, order.id, "processing_fee", deal.processing_fee, "flutterwave", "success")),
    ...payout > 0 ? [h.insert("ledger", ledgerRow(ctx, order.id, "seller_payout", payout, "seller", "pending", iso(settles)))] : [],
    h.event(reason === "buyer_confirmed" ? "buyer" : "system", reason)
  ]);
  if (!won) return false;
  await sendPendingTransfers(ctx, order.id);
  await ctx.notify.send({
    orderId: order.id,
    event: "payout_released",
    phone: seller.phone,
    email: seller.email,
    sms: `TrustGap: ${formatNaira(payout)} for order ${order.ref} has been released to your ${seller.payout_bank_name} account${settles > ctx.now() ? ` and will be sent on ${fmtDate(settles)}, once the buyer's payment has settled` : ""}.${recovered ? ` (${formatNaira(recovered)} was deducted for what you owed.)` : ""}`
  });
  await ctx.notify.send({
    orderId: order.id,
    event: "order_complete",
    phone: order.buyer_phone,
    sms: `TrustGap: order ${order.ref} is complete. Thank you for buying safely.`
  });
  return true;
}
__name(releaseToSeller, "releaseToSeller");
var TRANSFER_KINDS = "('seller_payout', 'buyer_refund')";
async function sendPendingTransfers(ctx, orderId) {
  const rows = await all(
    ctx.env,
    `SELECT id FROM ledger WHERE order_id = ? AND status = 'pending' AND kind IN ${TRANSFER_KINDS} AND (not_before IS NULL OR not_before <= ?)`,
    orderId,
    iso(ctx.now())
  );
  for (const r of rows) await sendTransfer(ctx, r.id);
}
__name(sendPendingTransfers, "sendPendingTransfers");
async function sendTransfer(ctx, ledgerId, { manual = false } = {}) {
  const from = manual ? "('pending', 'unknown', 'failed', 'needs_attention')" : "('pending', 'unknown', 'failed')";
  const claim = await run(
    ctx.env,
    `UPDATE ledger SET
       attempt = CASE WHEN status IN ('failed', 'needs_attention') THEN attempt + 1 ELSE attempt END,
       transfer_ref = 'TGT-' || id || '-' || CASE WHEN status IN ('failed', 'needs_attention') THEN attempt + 1 ELSE attempt END,
       status = 'sending'
     WHERE id = ? AND status IN ${from} AND kind IN ${TRANSFER_KINDS} AND (not_before IS NULL OR not_before <= ?)`,
    ledgerId,
    iso(ctx.now())
  );
  const row = await first(ctx.env, "SELECT * FROM ledger WHERE id = ?", ledgerId);
  if (claim.meta.changes !== 1) return row;
  const order = await getOrder(ctx, row.order_id);
  let dest;
  if (row.kind === "seller_payout") {
    const s = await getSeller(ctx, order.seller_id);
    dest = { bankCode: s.payout_bank_code, accountNumber: s.payout_account_number, accountName: s.payout_account_name };
  } else {
    dest = {
      bankCode: order.refund_bank_code,
      accountNumber: await decrypt(order.refund_account_enc, ctx.config.appSecret),
      accountName: order.refund_account_name
    };
  }
  try {
    const res = await ctx.payments.transfer({ ...dest, amount: row.amount, narration: `TrustGap ${order.ref}`, reference: row.transfer_ref });
    await update(ctx.env, "ledger", row.id, {
      status: res.status === "success" ? "success" : "submitted",
      provider_ref: res.providerRef || null,
      last_error: null
    });
  } catch (err) {
    await recordTransferFailure(ctx, row, err);
  }
  return first(ctx.env, "SELECT * FROM ledger WHERE id = ?", ledgerId);
}
__name(sendTransfer, "sendTransfer");
async function recordTransferFailure(ctx, row, err) {
  const message = String(err.message).slice(0, 300);
  if (err.duplicate) {
    await update(ctx.env, "ledger", row.id, { status: "submitted", last_error: null });
    return;
  }
  const status = !err.definite ? "unknown" : row.attempt >= ctx.config.maxTransferAttempts ? "needs_attention" : "failed";
  await update(ctx.env, "ledger", row.id, { status, last_error: message });
  await logEvent(ctx, row.order_id, "system", status === "needs_attention" ? "transfer_needs_attention" : "transfer_failed", {
    ledger_id: row.id,
    reference: row.transfer_ref,
    error: message
  });
}
__name(recordTransferFailure, "recordTransferFailure");
async function settleTransfer(ctx, { reference, providerRef }) {
  const row = reference ? await first(ctx.env, "SELECT * FROM ledger WHERE transfer_ref = ?", reference) : await first(ctx.env, "SELECT * FROM ledger WHERE provider_ref = ?", providerRef);
  if (!row || !["submitted", "unknown"].includes(row.status)) return row;
  const result = await ctx.payments.verifyTransfer({ providerRef: providerRef || row.provider_ref, reference: row.transfer_ref });
  if (result.status === "success") {
    await update(ctx.env, "ledger", row.id, { status: "success", provider_ref: result.providerRef || row.provider_ref, last_error: null });
  } else if (result.status === "failed") {
    const err = Object.assign(new Error(result.reason || "Transfer failed at the bank"), { definite: true });
    await recordTransferFailure(ctx, row, err);
  }
  return first(ctx.env, "SELECT * FROM ledger WHERE id = ?", row.id);
}
__name(settleTransfer, "settleTransfer");

// src/routes/public.js
var escapeHtml = /* @__PURE__ */ __name((s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), "escapeHtml");
async function loadDeal(ctx, token) {
  const deal = await first(ctx.env, "SELECT * FROM deals WHERE token = ?", token);
  if (!deal) throw notFound("Link not found. Check the link with the seller.");
  return refreshDeal(ctx, deal);
}
__name(loadDeal, "loadDeal");
async function loadOrderByBuyerToken(ctx, token) {
  const order = await first(ctx.env, "SELECT * FROM orders WHERE buyer_token = ?", token);
  if (!order) throw notFound("Order not found.");
  return order;
}
__name(loadOrderByBuyerToken, "loadOrderByBuyerToken");
function publicRoutes(r) {
  r.get("/api/health", () => ({ ok: true }));
  r.get("/api/config", async ({ ctx }) => ({
    test_mode: ctx.config.testMode,
    payment_provider: ctx.payments.name,
    fee: ctx.config.fee,
    processing: ctx.config.processing,
    max_deal: ctx.config.maxDealKobo,
    inspection_hours: ctx.config.inspectionHours,
    zones: ZONES.map(({ id, name }) => ({ id, name })),
    conditions: CONDITIONS,
    expiry_options: EXPIRY_OPTIONS,
    dispute_categories: BUYER_DISPUTE_CATEGORIES,
    require_seller_id: ctx.config.requireSellerId
  }));
  r.get("/api/banks", async ({ ctx }) => ({ banks: await ctx.payments.listBanks() }));
  r.get("/api/deals/:token", async ({ ctx, params }) => {
    const deal = await loadDeal(ctx, params.token);
    return { deal: await publicDealView(ctx, deal), rules: RULES(deal) };
  });
  r.post("/api/deals/:token/accept", async ({ ctx, params }) => startCheckout(ctx, await loadDeal(ctx, params.token)));
  r.post("/api/deals/:token/pay", async ({ ctx, params, body }) => {
    const deal = await loadDeal(ctx, params.token);
    if (deal.status !== "open") throw new UserError("This link is no longer available.", 410);
    const { order, payment_url } = await placeOrder(ctx, { deal, input: body });
    return { payment_url, track_token: order.buyer_token };
  });
  r.get("/api/payments/callback", async ({ ctx, url }) => {
    const order = await confirmPayment(ctx, url.searchParams.get("tx_ref") || "", "buyer");
    if (!order) return redirect(`${ctx.config.siteUrl}/?error=payment-not-found`);
    return redirect(`${ctx.config.siteUrl}/track.html?t=${order.buyer_token}`);
  });
  r.post("/webhooks/flutterwave", async ({ ctx, request, body }) => {
    const hint = await ctx.payments.parseWebhook(request, body);
    if (!hint) return new Response("unauthorized", { status: 401 });
    if (hint.kind === "transfer") await settleTransfer(ctx, hint);
    else await confirmPayment(ctx, hint.txRef, "webhook");
    return new Response("ok");
  });
  r.get("/mock/pay/:txRef", async ({ ctx, params }) => {
    if (ctx.payments.name !== "mock") throw notFound();
    const tx = await first(ctx.env, "SELECT * FROM mock_transactions WHERE tx_ref = ?", params.txRef);
    if (!tx) throw notFound("Unknown test payment.");
    return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test checkout</title><style>body{font:16px system-ui,sans-serif;background:#F4F7FC;margin:0;padding:24px;color:#0B1B3D}
.card{max-width:420px;margin:40px auto;background:#fff;border:1px solid #dfe5e2;border-radius:12px;padding:24px;text-align:center}
button{display:block;width:100%;margin:10px 0;padding:14px;border:0;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;background:#0B1B3D;color:#F4F7FC}
button.alt{background:#fff;color:#0B1B3D;box-shadow:inset 0 0 0 1.5px #0B1B3D}.tag{display:inline-block;background:#fff4dd;color:#9a5b00;border-radius:99px;padding:2px 10px;font-size:13px;font-weight:600}</style></head>
<body><div class="card"><span class="tag">Simulated payment page</span><h1>Pay ${escapeHtml(formatNaira(tx.amount))}</h1>
<p>In live mode this is Flutterwave's checkout (card, bank transfer, USSD).</p>
<form method="post"><button name="result" value="successful">Simulate successful payment</button>
<button class="alt" name="result" value="failed">Simulate failed payment</button></form></div></body></html>`);
  });
  r.post("/mock/pay/:txRef", async ({ ctx, params, body }) => {
    if (ctx.payments.name !== "mock") throw notFound();
    await ctx.payments.setMockStatus(params.txRef, body.result === "successful" ? "successful" : "failed");
    return redirect(`${ctx.config.apiUrl}/api/payments/callback?tx_ref=${encodeURIComponent(params.txRef)}`);
  });
  r.get("/api/track/:token", async ({ ctx, params }) => {
    const o = await loadOrderByBuyerToken(ctx, params.token);
    const deal = await getDeal(ctx, o.deal_id);
    const seller = await getSeller(ctx, o.seller_id);
    const dispute = await first(ctx.env, "SELECT * FROM disputes WHERE order_id = ? ORDER BY id DESC", o.id);
    const events = await all(ctx.env, "SELECT type, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id", o.id);
    const dealNow = await refreshDeal(ctx, deal);
    const canReport = ["paid", "shipping"].includes(o.status) || o.status === "delivered" && new Date(o.inspection_ends_at) > ctx.now();
    return {
      order: {
        ref: o.ref,
        status: o.status,
        amount: o.amount,
        item_title: deal.item_title,
        seller_name: seller.business_name,
        seller_phone: seller.phone,
        delivery_area: zoneById(deal.delivery_zone)?.name,
        delivery_status: o.delivery_status,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        pin: ["paid", "shipping"].includes(o.status) ? await revealPin(ctx, o) : null,
        ship_by: o.ship_by,
        delivered_at: o.delivered_at,
        inspection_ends_at: o.inspection_ends_at,
        refund_account: `${o.refund_bank_name} \u2022\u2022\u2022\u2022${o.refund_account_last4}`,
        terms_hash: o.terms_hash,
        terms_accepted_at: o.terms_accepted_at,
        rules: JSON.parse(o.terms_json).rules,
        can_retry_payment: ["awaiting_payment", "cancelled"].includes(o.status) && dealNow.status === "open",
        can_confirm: o.status === "delivered",
        can_report: canReport
      },
      dispute: dispute && {
        status: dispute.status,
        category: dispute.category,
        resolution_note: dispute.resolution_note,
        buyer_refund: dispute.buyer_refund
      },
      events
    };
  });
  r.post("/api/track/:token/retry", async ({ ctx, params }) => retryPayment(ctx, await loadOrderByBuyerToken(ctx, params.token)));
  r.post("/api/track/:token/accept", async ({ ctx, params }) => {
    await releaseToSeller(ctx, await loadOrderByBuyerToken(ctx, params.token), "buyer_confirmed");
    return { ok: true };
  });
  r.post("/api/track/:token/dispute", async ({ ctx, params, body }) => {
    if (!BUYER_DISPUTE_CATEGORIES[body.category]) throw new UserError("Choose what went wrong.");
    await openDispute(ctx, await loadOrderByBuyerToken(ctx, params.token), { by: "buyer", category: body.category, description: body.description });
    return { ok: true };
  });
}
__name(publicRoutes, "publicRoutes");

// src/core/sellers.js
async function sendCode(ctx, phone, email = null) {
  const { otp } = ctx.config;
  const since = iso(new Date(ctx.now().getTime() - otp.windowMinutes * 6e4));
  const recent = await first(ctx.env, "SELECT COUNT(*) n FROM otps WHERE phone = ? AND created_at > ?", phone, since);
  if (recent.n >= otp.maxPerWindow) {
    throw new UserError(`Too many codes requested. Wait ${otp.windowMinutes} minutes and try again.`, 429);
  }
  const code = randomDigits(6);
  await insert(ctx.env, "otps", {
    phone,
    code_hash: await hmac(ctx.config.appSecret, `otp:${phone}:${code}`),
    expires_at: iso(new Date(ctx.now().getTime() + otp.ttlMinutes * 6e4)),
    created_at: iso(ctx.now())
  });
  await ctx.notify.send({
    event: "login_code",
    phone,
    email,
    sms: `Your TrustGap code is ${code}. It expires in ${otp.ttlMinutes} minutes. Never share it with anyone.`,
    emailSubject: "Your TrustGap login code"
  });
  return ctx.config.testMode ? { dev_code: code } : {};
}
__name(sendCode, "sendCode");
async function signup(ctx, input) {
  const fullName = requireLength(input.full_name, "Full name", 3, 100);
  if (fullName.split(/\s+/).length < 2) throw new UserError("Enter your full name (first and last name), as on your bank account.");
  const businessName = requireLength(input.business_name, "Business name", 2, 80);
  const phone = normalisePhone(input.phone);
  const email = validEmail(input.email);
  const existing = await first(ctx.env, "SELECT * FROM sellers WHERE phone = ?", phone);
  if (existing?.phone_verified_at) throw new UserError("An account with this phone number already exists. Log in instead.");
  if (existing) {
    await update(ctx.env, "sellers", existing.id, { full_name: fullName, business_name: businessName, email });
  } else {
    await insert(ctx.env, "sellers", { full_name: fullName, business_name: businessName, phone, email, created_at: iso(ctx.now()) });
  }
  return { phone, ...await sendCode(ctx, phone, email) };
}
__name(signup, "signup");
async function requestLogin(ctx, input) {
  const phone = normalisePhone(input.phone);
  const seller = await first(ctx.env, "SELECT * FROM sellers WHERE phone = ?", phone);
  if (!seller) throw new UserError("No seller account uses this number. Sign up first.", 404);
  return { phone, ...await sendCode(ctx, phone, seller.email) };
}
__name(requestLogin, "requestLogin");
async function verifyCode(ctx, input) {
  const phone = normalisePhone(input.phone);
  const code = str(input.code);
  const { otp } = ctx.config;
  const row = await first(
    ctx.env,
    "SELECT * FROM otps WHERE phone = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1",
    phone,
    iso(ctx.now())
  );
  if (!row) throw new UserError("That code has expired. Request a new one.");
  if (row.attempts >= otp.maxAttempts) throw new UserError("Too many wrong codes. Request a new one.");
  if (!safeEqual(row.code_hash, await hmac(ctx.config.appSecret, `otp:${phone}:${code}`))) {
    await run(ctx.env, "UPDATE otps SET attempts = attempts + 1 WHERE id = ?", row.id);
    throw new UserError(`Wrong code. ${otp.maxAttempts - row.attempts - 1} attempt(s) left.`);
  }
  const claimed = await run(ctx.env, "UPDATE otps SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL", iso(ctx.now()), row.id);
  if (claimed.meta.changes !== 1) throw new UserError("That code was already used. Request a new one.");
  const seller = await first(ctx.env, "SELECT * FROM sellers WHERE phone = ?", phone);
  if (!seller) throw new UserError("No seller account uses this number.", 404);
  if (!seller.phone_verified_at) await update(ctx.env, "sellers", seller.id, { phone_verified_at: iso(ctx.now()) });
  return { token: await createSession(ctx, { sellerId: seller.id }) };
}
__name(verifyCode, "verifyCode");
async function createSession(ctx, { sellerId = null, isAdmin = false }) {
  const token = randomToken(32);
  const hours = isAdmin ? 12 : ctx.config.sessionDays * 24;
  await insert(ctx.env, "sessions", {
    token_hash: await sha256Hex(token),
    seller_id: sellerId,
    is_admin: isAdmin,
    expires_at: iso(new Date(ctx.now().getTime() + hours * 36e5)),
    created_at: iso(ctx.now())
  });
  return token;
}
__name(createSession, "createSession");
async function authenticate(ctx, request) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/);
  if (!m) return null;
  return first(ctx.env, "SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?", await sha256Hex(m[1]), iso(ctx.now()));
}
__name(authenticate, "authenticate");
async function logout(ctx, session) {
  if (session) await run(ctx.env, "DELETE FROM sessions WHERE token_hash = ?", session.token_hash);
}
__name(logout, "logout");
async function adminLogin(ctx, input) {
  const { env } = ctx;
  const windowStart = iso(new Date(ctx.now().getTime() - 15 * 6e4));
  const fails = JSON.parse((await first(env, "SELECT value FROM meta WHERE key = 'admin_fails'"))?.value || "[]").filter((t) => t > windowStart);
  if (fails.length >= 10) throw new UserError("Too many attempts. Try again in 15 minutes.", 429);
  if (!ctx.config.adminPassword || !safeEqual(str(input.password), ctx.config.adminPassword)) {
    fails.push(iso(ctx.now()));
    await run(env, "INSERT INTO meta (key, value) VALUES ('admin_fails', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(fails));
    throw new UserError("Wrong password.", 401);
  }
  return { token: await createSession(ctx, { isAdmin: true }) };
}
__name(adminLogin, "adminLogin");
function sellerView(s) {
  return {
    id: s.id,
    full_name: s.full_name,
    business_name: s.business_name,
    phone: s.phone,
    email: s.email,
    pickup_address: s.pickup_address,
    pickup_zone: s.pickup_zone,
    payout: s.payout_verified_at ? { bank_name: s.payout_bank_name, account_number: s.payout_account_number, account_name: s.payout_account_name } : null,
    identity_verified: Boolean(s.identity_verified_at),
    identity_verified_at: s.identity_verified_at,
    id_type: s.id_type,
    id_attempts_left: Math.max(0, 3 - (s.id_attempts || 0)),
    amount_owed: s.amount_owed,
    suspended: Boolean(s.suspended_at)
  };
}
__name(sellerView, "sellerView");
async function setPayoutAccount(ctx, seller, input) {
  const bankCode = str(input.bank_code);
  const accountNumber = str(input.account_number);
  if (!/^\d{10}$/.test(accountNumber)) throw new UserError("Account number must be 10 digits.");
  const bank = (await ctx.payments.listBanks()).find((b) => b.code === bankCode);
  if (!bank) throw new UserError("Choose your bank.");
  let accountName;
  try {
    ({ accountName } = await ctx.payments.resolveAccount({ bankCode, accountNumber }));
  } catch (err) {
    throw new UserError(`We could not confirm that account: ${err.message}`);
  }
  if (!namesMatch(seller.full_name, accountName)) {
    throw new UserError(
      `That account belongs to "${accountName}", which does not match your registered name "${seller.full_name}". Payouts can only go to an account in your own name.`
    );
  }
  await update(ctx.env, "sellers", seller.id, {
    payout_bank_code: bankCode,
    payout_bank_name: bank.name,
    payout_account_number: accountNumber,
    payout_account_name: accountName,
    payout_verified_at: iso(ctx.now())
  });
  return sellerView(await getSeller(ctx, seller.id));
}
__name(setPayoutAccount, "setPayoutAccount");
async function verifyIdentity(ctx, seller, input) {
  if (seller.identity_verified_at) throw new UserError("Your identity is already verified.");
  const max = ctx.config.maxIdentityAttempts;
  if (seller.id_attempts >= max) {
    throw new UserError(`You have used all ${max} verification attempts. Contact TrustGap support to finish verification.`, 429);
  }
  const nin = str(input.nin ?? input.id_number).replace(/\s/g, "");
  if (!/^\d{11}$/.test(nin)) throw new UserError("Your NIN is 11 digits.");
  const dob = str(input.dob);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new UserError("Enter your date of birth.");
  const used = /* @__PURE__ */ __name(async () => {
    await run(ctx.env, "UPDATE sellers SET id_attempts = id_attempts + 1 WHERE id = ?", seller.id);
    const left = max - seller.id_attempts - 1;
    return left > 0 ? ` You have ${left} attempt${left > 1 ? "s" : ""} left.` : " That was your last attempt \u2014 contact TrustGap support.";
  }, "used");
  let person;
  try {
    person = await ctx.identity.verify({ idType: "nin", idNumber: nin });
  } catch (err) {
    if (err.retryable) throw new UserError(`Identity check unavailable: ${err.message}`, 503);
    throw new UserError(`Identity check failed: ${err.message}.${await used()}`);
  }
  const officialName = [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
  if (!namesMatch(seller.full_name, officialName)) {
    throw new UserError(`This NIN is registered to a different name. It must match your account name "${seller.full_name}".${await used()}`);
  }
  if (person.dob && person.dob !== dob) {
    throw new UserError(`The date of birth does not match the NIN record.${await used()}`);
  }
  await update(ctx.env, "sellers", seller.id, {
    id_type: "nin",
    id_last4: nin.slice(-4),
    id_verified_name: officialName.toUpperCase(),
    id_provider_ref: person.providerRef || null,
    identity_verified_at: iso(ctx.now())
  });
  return sellerView(await getSeller(ctx, seller.id));
}
__name(verifyIdentity, "verifyIdentity");

// src/routes/seller.js
async function requireSeller(ctx, request) {
  const session = await authenticate(ctx, request);
  if (!session?.seller_id) throw new UserError("Please log in.", 401);
  const seller = await getSeller(ctx, session.seller_id);
  if (!seller) throw new UserError("Please log in.", 401);
  return { session, seller };
}
__name(requireSeller, "requireSeller");
var dealView = /* @__PURE__ */ __name((ctx, d) => ({
  id: d.id,
  status: d.status,
  link: payUrl(ctx, d),
  item_title: d.item_title,
  item_description: d.item_description,
  item_condition: d.item_condition,
  quantity: d.quantity,
  pickup_address: d.pickup_address,
  pickup_area: zoneById(d.pickup_zone)?.name,
  delivery_area: zoneById(d.delivery_zone)?.name,
  delivery_payer: d.delivery_payer,
  fee_payer: d.fee_payer,
  delivery_days: d.delivery_days,
  expires_at: d.expires_at,
  created_at: d.created_at,
  price: priceBreakdown(d)
}), "dealView");
function sellerRoutes(r) {
  r.post("/api/auth/signup", ({ ctx, body }) => signup(ctx, body));
  r.post("/api/auth/login", ({ ctx, body }) => requestLogin(ctx, body));
  r.post("/api/auth/verify", ({ ctx, body }) => verifyCode(ctx, body));
  r.post("/api/auth/logout", async ({ ctx, request }) => {
    await logout(ctx, await authenticate(ctx, request));
    return { ok: true };
  });
  r.get("/api/seller/me", async ({ ctx, request }) => ({ seller: sellerView((await requireSeller(ctx, request)).seller) }));
  r.post("/api/seller/payout", async ({ ctx, request, body }) => ({
    seller: await setPayoutAccount(ctx, (await requireSeller(ctx, request)).seller, body)
  }));
  r.post("/api/seller/identity", async ({ ctx, request, body }) => ({
    seller: await verifyIdentity(ctx, (await requireSeller(ctx, request)).seller, body)
  }));
  r.get("/api/seller/dashboard", async ({ ctx, request }) => {
    const { seller } = await requireSeller(ctx, request);
    const orders = await all(
      ctx.env,
      `SELECT o.id, o.ref, o.status, o.buyer_name, o.paid_at, o.amount, d.item_title, d.seller_payout
       FROM orders o JOIN deals d ON d.id = o.deal_id
       WHERE o.seller_id = ? AND o.status NOT IN ('awaiting_payment', 'cancelled', 'duplicate_refunded')
       ORDER BY o.id DESC LIMIT 50`,
      seller.id
    );
    const deals = [];
    for (const d of await all(ctx.env, "SELECT * FROM deals WHERE seller_id = ? AND status IN ('open','expired') ORDER BY id DESC LIMIT 20", seller.id)) {
      deals.push(dealView(ctx, await refreshDeal(ctx, d)));
    }
    return {
      seller: sellerView(seller),
      stats: {
        to_ship: orders.filter((o) => o.status === "paid").length,
        held: orders.filter((o) => HELD_STATUSES.includes(o.status)).reduce((a, o) => a + o.seller_payout, 0),
        completed: orders.filter((o) => o.status === "completed").length
      },
      orders,
      deals
    };
  });
  r.post("/api/seller/deals", async ({ ctx, request, body }) => {
    const deal = await createDeal(ctx, (await requireSeller(ctx, request)).seller, body);
    return { deal: dealView(ctx, deal) };
  });
  r.get("/api/seller/deals/:id", async ({ ctx, request, params }) => {
    const { seller } = await requireSeller(ctx, request);
    const d = await first(ctx.env, "SELECT * FROM deals WHERE id = ? AND seller_id = ?", Number(params.id), seller.id);
    if (!d) throw notFound("Link not found.");
    const order = await first(ctx.env, "SELECT id FROM orders WHERE deal_id = ? AND status NOT IN ('awaiting_payment','cancelled','duplicate_refunded')", d.id);
    return { deal: dealView(ctx, await refreshDeal(ctx, d)), order_id: order?.id || null };
  });
  r.post("/api/seller/deals/:id/cancel", async ({ ctx, request, params }) => {
    await cancelDeal(ctx, (await requireSeller(ctx, request)).seller, Number(params.id));
    return { ok: true };
  });
  r.get("/api/seller/orders/:id", async ({ ctx, request, params }) => {
    const { seller } = await requireSeller(ctx, request);
    const o = await first(ctx.env, "SELECT * FROM orders WHERE id = ? AND seller_id = ?", Number(params.id), seller.id);
    if (!o) throw notFound("Order not found.");
    const d = await first(ctx.env, "SELECT * FROM deals WHERE id = ?", o.deal_id);
    const dispute = await first(ctx.env, "SELECT status, category, description, resolution_note, seller_payout FROM disputes WHERE order_id = ? ORDER BY id DESC", o.id);
    return {
      order: {
        id: o.id,
        ref: o.ref,
        status: o.status,
        item_title: d.item_title,
        seller_payout: d.seller_payout,
        buyer_name: o.buyer_name,
        delivery_area: zoneById(d.delivery_zone)?.name,
        delivery_status: o.delivery_status,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        packing_note: o.packing_note,
        ship_by: o.ship_by,
        delivered_at: o.delivered_at,
        inspection_ends_at: o.inspection_ends_at
      },
      dispute,
      events: await all(ctx.env, "SELECT type, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id", o.id)
    };
  });
  r.post("/api/seller/orders/:id/book", async ({ ctx, request, params, body }) => {
    await bookPickup(ctx, (await requireSeller(ctx, request)).seller, Number(params.id), body.packing_note);
    return { ok: true };
  });
}
__name(sellerRoutes, "sellerRoutes");

// src/core/jobs.js
async function runJobs(ctx) {
  const now = iso(ctx.now());
  const result = { expired: 0, cancelled: 0, released: 0, notShipped: 0, transfersSent: 0, transfersChecked: 0, resent: 0 };
  result.expired = (await run(ctx.env, "UPDATE deals SET status = 'expired' WHERE status = 'open' AND expires_at <= ?", now)).meta.changes;
  const staleBefore = iso(new Date(ctx.now().getTime() - ctx.config.paymentTimeoutMinutes * 2 * 6e4));
  for (const o of await all(ctx.env, "SELECT * FROM orders WHERE status = 'awaiting_payment' AND created_at <= ? LIMIT 50", staleBefore)) {
    const fresh = await confirmPayment(ctx, o.tx_ref, "system");
    if (fresh.status === "awaiting_payment" && await transition(ctx, o.id, ["awaiting_payment"], { status: "cancelled", closed_at: now })) {
      await logEvent(ctx, o.id, "system", "checkout_abandoned");
      result.cancelled++;
    }
  }
  for (const o of await all(ctx.env, "SELECT * FROM orders WHERE status = 'delivered' AND inspection_ends_at <= ? LIMIT 50", now)) {
    if (await releaseToSeller(ctx, o, "auto_released")) result.released++;
  }
  for (const o of await all(ctx.env, "SELECT * FROM orders WHERE status = 'paid' AND ship_by <= ? LIMIT 50", now)) {
    await openDispute(ctx, o, { by: "system", category: "not_shipped", description: "The seller did not book pickup within the agreed time." });
    result.notShipped++;
  }
  for (const l of await all(
    ctx.env,
    `SELECT id FROM ledger WHERE kind IN ('seller_payout', 'buyer_refund') AND status IN ('pending', 'unknown', 'failed')
     AND (not_before IS NULL OR not_before <= ?) LIMIT 50`,
    now
  )) {
    await sendTransfer(ctx, l.id);
    result.transfersSent++;
  }
  const checkBefore = iso(new Date(ctx.now().getTime() - 30 * 6e4));
  for (const l of await all(ctx.env, "SELECT transfer_ref, provider_ref FROM ledger WHERE status = 'submitted' AND created_at <= ? LIMIT 50", checkBefore)) {
    await settleTransfer(ctx, { reference: l.transfer_ref, providerRef: l.provider_ref });
    result.transfersChecked++;
  }
  for (const m of await all(ctx.env, "SELECT id FROM outbox WHERE status = 'failed' AND attempts < 5 LIMIT 50")) {
    await deliver(ctx, m.id);
    result.resent++;
  }
  const dayAgo = iso(new Date(ctx.now().getTime() - 864e5));
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    ctx.env.DB.prepare("DELETE FROM otps WHERE created_at < ?").bind(dayAgo)
  ]);
  return result;
}
__name(runJobs, "runJobs");

// src/providers/sheets.js
var naira = /* @__PURE__ */ __name((kobo) => kobo == null ? "" : kobo / 100, "naira");
var ROW_LIMIT = 5e3;
var TABS = {
  Orders: {
    sql: `SELECT o.*, d.item_title, d.delivery_zone, d.seller_payout, s.business_name
          FROM orders o JOIN deals d ON d.id = o.deal_id JOIN sellers s ON s.id = o.seller_id
          WHERE o.status != 'cancelled' ORDER BY o.id DESC LIMIT ${ROW_LIMIT}`,
    header: [
      "Ref",
      "Status",
      "Item",
      "Seller",
      "Buyer",
      "Buyer phone",
      "Delivery area",
      "Paid (\u20A6)",
      "Seller gets (\u20A6)",
      "Delivery",
      "Paid at",
      "Delivered at",
      "Closed at",
      "Created at"
    ],
    row: /* @__PURE__ */ __name((o) => [
      o.ref,
      o.status,
      o.item_title,
      o.business_name,
      o.buyer_name,
      o.buyer_phone,
      zoneById(o.delivery_zone)?.name || o.delivery_zone,
      naira(o.amount),
      naira(o.seller_payout),
      o.delivery_status,
      o.paid_at,
      o.delivered_at,
      o.closed_at,
      o.created_at
    ], "row")
  },
  Sellers: {
    sql: `SELECT * FROM sellers ORDER BY id DESC LIMIT ${ROW_LIMIT}`,
    header: ["ID", "Business", "Full name", "Phone", "Email", "Phone verified", "ID verified", "Payout bank", "Owes (\u20A6)", "Suspended", "Joined"],
    row: /* @__PURE__ */ __name((s) => [
      s.id,
      s.business_name,
      s.full_name,
      s.phone,
      s.email,
      s.phone_verified_at ? "yes" : "no",
      s.identity_verified_at ? "yes" : "no",
      s.payout_bank_name || "",
      naira(s.amount_owed),
      s.suspended_at ? "yes" : "",
      s.created_at
    ], "row")
  },
  Disputes: {
    sql: `SELECT x.*, o.ref FROM disputes x JOIN orders o ON o.id = x.order_id ORDER BY x.id DESC LIMIT ${ROW_LIMIT}`,
    header: ["ID", "Order", "Status", "Category", "Opened by", "Description", "Decision", "Buyer refund (\u20A6)", "Seller payout (\u20A6)", "Seller charge (\u20A6)", "Opened", "Resolved"],
    row: /* @__PURE__ */ __name((x) => [
      x.id,
      x.ref,
      x.status,
      x.category,
      x.opened_by,
      x.description,
      x.resolution_note || "",
      naira(x.buyer_refund),
      naira(x.seller_payout),
      naira(x.seller_charge),
      x.created_at,
      x.resolved_at || ""
    ], "row")
  },
  Ledger: {
    sql: `SELECT l.*, o.ref FROM ledger l LEFT JOIN orders o ON o.id = l.order_id ORDER BY l.id DESC LIMIT ${ROW_LIMIT}`,
    header: ["ID", "Order", "Kind", "To", "Amount (\u20A6)", "Status", "Provider ref", "Created"],
    row: /* @__PURE__ */ __name((l) => [l.id, l.ref, l.kind, l.counterparty, naira(l.amount), l.status, l.provider_ref || "", l.created_at], "row")
  }
};
function pemToDer(pem) {
  const b64 = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
__name(pemToDer, "pemToDer");
var b64url2 = /* @__PURE__ */ __name((s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64url");
async function accessToken(env, now) {
  const iat = Math.floor(now.getTime() / 1e3);
  const header = b64url2(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url2(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600
  }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(env.GOOGLE_PRIVATE_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const jwt = `${header}.${claims}.${b64url2(String.fromCharCode(...new Uint8Array(sig)))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Google auth failed: " + (data.error_description || data.error || res.status));
  return data.access_token;
}
__name(accessToken, "accessToken");
var sheetsConfigured = /* @__PURE__ */ __name((env) => Boolean(env.GOOGLE_SHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY), "sheetsConfigured");
async function syncSheets(ctx) {
  const { env } = ctx;
  if (!sheetsConfigured(env)) return { skipped: "Google Sheets is not configured" };
  const token = await accessToken(env, ctx.now());
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}`;
  const google = /* @__PURE__ */ __name(async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : void 0
    });
    const data2 = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Sheets ${path}: ${data2.error?.message || res.status}`);
    return data2;
  }, "google");
  const tabs = { Summary: null, ...TABS };
  const meta = await google("GET", "?fields=sheets.properties.title");
  const existing = new Set(meta.sheets.map((s) => s.properties.title));
  const missing = Object.keys(tabs).filter((t) => !existing.has(t));
  if (missing.length) {
    await google("POST", ":batchUpdate", { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) });
  }
  const held = await first(env, "SELECT COALESCE(SUM(amount), 0) t FROM orders WHERE status IN ('paid','shipping','delivered','disputed')");
  const openDisputes = await first(env, "SELECT COUNT(*) n FROM disputes WHERE status = 'open'");
  const data = [
    {
      range: "Summary!A1",
      values: [
        ["TrustGap \u2014 read-only copy. Edits here are overwritten."],
        ["Last synced", ctx.now().toISOString()],
        ["Money held for open orders (\u20A6)", naira(held.t)],
        ["Open disputes", openDisputes.n]
      ]
    }
  ];
  for (const [title, tab] of Object.entries(TABS)) {
    const rows = await all(env, tab.sql);
    data.push({ range: `${title}!A1`, values: [tab.header, ...rows.map(tab.row)] });
  }
  await google("POST", "/values:batchClear", { ranges: Object.keys(tabs).map((t) => `${t}!A:Z`) });
  await google("POST", "/values:batchUpdate", { valueInputOption: "RAW", data });
  await run(env, "INSERT INTO meta (key, value) VALUES ('sheets_synced_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", ctx.now().toISOString());
  return { synced: data.length };
}
__name(syncSheets, "syncSheets");

// src/routes/admin.js
async function requireAdmin(ctx, request) {
  const session = await authenticate(ctx, request);
  if (!session?.is_admin) throw new UserError("Admin login required.", 401);
}
__name(requireAdmin, "requireAdmin");
async function riderOrder(ctx, token) {
  const data = await verifyLink(ctx.config.appSecret, token, ctx.now());
  const id = data?.startsWith("rider-") ? Number(data.slice(6)) : null;
  const order = id && await getOrder(ctx, id);
  if (!order) throw new UserError("This rider link is invalid or has expired.", 404);
  return order;
}
__name(riderOrder, "riderOrder");
function riderRoutes(r) {
  r.get("/api/rider/:token", async ({ ctx, params }) => {
    const o = await riderOrder(ctx, params.token);
    const d = await getDeal(ctx, o.deal_id);
    const s = await getSeller(ctx, o.seller_id);
    return {
      order: {
        ref: o.ref,
        status: o.status,
        delivery_status: o.delivery_status,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        item_title: d.item_title,
        item_condition: d.item_condition,
        item_description: d.item_description,
        quantity: d.quantity,
        packing_note: o.packing_note,
        pickup: { name: s.business_name, phone: s.phone, address: d.pickup_address },
        dropoff: { name: o.buyer_name, phone: o.buyer_phone, address: o.delivery_address, landmark: o.delivery_landmark }
      }
    };
  });
  r.post("/api/rider/:token/status", async ({ ctx, params, body }) => {
    await applyDeliveryUpdate(ctx, await riderOrder(ctx, params.token), { status: body.status, note: body.note, actor: "rider" });
    return { ok: true };
  });
  r.post("/api/rider/:token/pin", async ({ ctx, params, body }) => {
    await verifyDeliveryPin(ctx, await riderOrder(ctx, params.token), body.pin, "rider");
    return { ok: true };
  });
}
__name(riderRoutes, "riderRoutes");
function adminRoutes(r) {
  r.post("/api/admin/login", ({ ctx, body }) => adminLogin(ctx, body));
  const admin = /* @__PURE__ */ __name((handler) => async (args) => {
    await requireAdmin(args.ctx, args.request);
    return handler(args);
  }, "admin");
  r.get("/api/admin/orders", admin(async ({ ctx, url }) => {
    const status = url.searchParams.get("status") || "";
    const orders = await all(
      ctx.env,
      `SELECT o.id, o.ref, o.status, o.amount, o.buyer_name, o.created_at, d.item_title, s.business_name
       FROM orders o JOIN deals d ON d.id = o.deal_id JOIN sellers s ON s.id = o.seller_id
       WHERE (? = '' AND o.status != 'cancelled') OR o.status = ? ORDER BY o.id DESC LIMIT 200`,
      status,
      status
    );
    const counts = Object.fromEntries((await all(ctx.env, "SELECT status, COUNT(*) n FROM orders GROUP BY status")).map((x) => [x.status, x.n]));
    return { orders, counts };
  }));
  r.get("/api/admin/orders/:id", admin(async ({ ctx, params }) => {
    const o = await getOrder(ctx, Number(params.id));
    if (!o) throw notFound("Order not found.");
    const d = await getDeal(ctx, o.deal_id);
    const s = await getSeller(ctx, o.seller_id);
    const { refund_account_enc, delivery_pin_enc, last_transition, terms_json, ...order } = o;
    return {
      order: {
        ...order,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        track_url: trackUrl(ctx, o),
        delivery_area: zoneById(d.delivery_zone)?.name
      },
      deal: { ...d, pickup_area: zoneById(d.pickup_zone)?.name, delivery_area: zoneById(d.delivery_zone)?.name },
      seller: {
        id: s.id,
        business_name: s.business_name,
        full_name: s.full_name,
        phone: s.phone,
        email: s.email,
        payout_bank_name: s.payout_bank_name,
        payout_account_number: s.payout_account_number,
        identity_verified: Boolean(s.identity_verified_at),
        amount_owed: s.amount_owed
      },
      disputes: (await all(ctx.env, "SELECT * FROM disputes WHERE order_id = ? ORDER BY id", o.id)).map((x) => ({
        ...x,
        category_label: DISPUTE_CATEGORIES[x.category] || x.category
      })),
      ledger: await all(ctx.env, "SELECT * FROM ledger WHERE order_id = ? ORDER BY id", o.id),
      events: await all(ctx.env, "SELECT * FROM order_events WHERE order_id = ? ORDER BY id", o.id),
      messages: await all(ctx.env, "SELECT * FROM outbox WHERE order_id = ? ORDER BY id", o.id)
    };
  }));
  r.post("/api/admin/disputes/:id/resolve", admin(async ({ ctx, params, body }) => {
    await resolveDispute(ctx, Number(params.id), body);
    return { ok: true };
  }));
  r.get("/api/admin/disputes", admin(async ({ ctx }) => ({
    disputes: (await all(
      ctx.env,
      `SELECT x.*, o.ref FROM disputes x JOIN orders o ON o.id = x.order_id ORDER BY x.status = 'open' DESC, x.id DESC LIMIT 200`
    )).map((x) => ({ ...x, category_label: DISPUTE_CATEGORIES[x.category] || x.category }))
  })));
  r.get("/api/admin/sellers", admin(async ({ ctx }) => ({
    sellers: await all(
      ctx.env,
      `SELECT id, business_name, full_name, phone, email, phone_verified_at, payout_verified_at, payout_bank_name,
              identity_verified_at, id_type, id_last4, amount_owed, suspended_at, created_at FROM sellers ORDER BY id DESC LIMIT 500`
    )
  })));
  r.post("/api/admin/sellers/:id", admin(async ({ ctx, params, body }) => {
    const fields = {
      verify: { identity_verified_at: iso(ctx.now()), id_type: "manual" },
      suspend: { suspended_at: iso(ctx.now()) },
      unsuspend: { suspended_at: null },
      settled: { amount_owed: 0 }
    }[body.action];
    if (!fields) throw new UserError("Unknown action.");
    if (!await getSeller(ctx, Number(params.id))) throw notFound("Seller not found.");
    await update(ctx.env, "sellers", Number(params.id), fields);
    return { ok: true };
  }));
  r.get("/api/admin/outbox", admin(async ({ ctx }) => ({
    messages: await all(ctx.env, "SELECT * FROM outbox ORDER BY id DESC LIMIT 300")
  })));
  r.get("/api/admin/ledger", admin(async ({ ctx }) => ({
    held: (await first(ctx.env, "SELECT COALESCE(SUM(amount),0) t FROM orders WHERE status IN ('paid','shipping','delivered','disputed')")).t,
    totals: await all(ctx.env, "SELECT kind, status, SUM(amount) total FROM ledger GROUP BY kind, status ORDER BY kind"),
    entries: await all(ctx.env, "SELECT l.*, o.ref FROM ledger l LEFT JOIN orders o ON o.id = l.order_id ORDER BY l.id DESC LIMIT 300"),
    sheets_synced_at: (await first(ctx.env, "SELECT value FROM meta WHERE key = 'sheets_synced_at'"))?.value || null
  })));
  r.post("/api/admin/ledger/:id/retry", admin(async ({ ctx, params }) => ({ entry: await sendTransfer(ctx, Number(params.id), { manual: true }) })));
  r.post("/api/admin/jobs", admin(async ({ ctx }) => ({ result: await runJobs(ctx) })));
  r.post("/api/admin/sync-sheets", admin(async ({ ctx }) => ({ result: await syncSheets(ctx) })));
}
__name(adminRoutes, "adminRoutes");

// src/index.js
var router = new Router();
publicRoutes(router);
sellerRoutes(router);
riderRoutes(router);
adminRoutes(router);
var index_default = {
  async fetch(request, env, execCtx) {
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      const url = new URL(request.url);
      const match = router.match(request.method, url.pathname);
      if (!match) throw new UserError("Not found", 404);
      const ctx = createContext(env, execCtx);
      const body = request.method === "POST" ? await readBody(request) : {};
      const out = await match.handler({ ctx, request, params: match.params, body, url });
      res = out instanceof Response ? out : json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof UserError) {
        res = json({ error: err.message }, err.status);
      } else {
        console.error(err);
        res = json({ error: "Something went wrong on our side. Your money is safe \u2014 please try again in a moment." }, 500);
      }
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  },
  // Cron trigger (wrangler.toml): timers every 5 minutes, Google Sheets copy every 15.
  async scheduled(event, env, execCtx) {
    const ctx = createContext(env, execCtx);
    await runJobs(ctx);
    if (new Date(event.scheduledTime).getUTCMinutes() % 15 === 0) {
      try {
        await syncSheets(ctx);
      } catch (err) {
        console.error("sheets sync failed", err);
      }
    }
  }
};
export {
  index_default as default
};
