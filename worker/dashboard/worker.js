// TrustGap Worker: GENERATED FILE, do not edit by hand.
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
  const choice = /* @__PURE__ */ __name((v, d) => String(v ?? "").trim().toLowerCase() || d, "choice");
  const testMode = env.TEST_MODE !== "false";
  if (!env.APP_SECRET && !testMode) throw new Error("APP_SECRET must be set when TEST_MODE is false");
  return {
    testMode,
    appSecret: env.APP_SECRET || "dev-only-insecure-secret",
    adminPassword: env.ADMIN_PASSWORD || (testMode ? "admin" : ""),
    siteUrl: String(env.SITE_URL || "http://localhost:8080").replace(/\/$/, ""),
    apiUrl: String(env.API_URL || "http://localhost:8787").replace(/\/$/, ""),
    // Logo on Flutterwave's checkout page: a public square PNG/JPG. Defaults to the website's icon.
    checkoutLogoUrl: String(env.CHECKOUT_LOGO_URL || "").trim() || `${String(env.SITE_URL || "http://localhost:8080").replace(/\/$/, "")}/assets/favicon.png`,
    paymentProvider: choice(env.PAYMENT_PROVIDER, "mock"),
    logisticsProvider: choice(env.LOGISTICS_PROVIDER, "manual"),
    identityProvider: choice(env.IDENTITY_PROVIDER, "mock"),
    requireSellerId: env.REQUIRE_SELLER_ID !== "false",
    // TrustGap fee (capped) and the "Payment processing" line that passes Flutterwave's costs on.
    // A cap of 0 means no cap.
    fee: {
      percent: num(env.FEE_PERCENT, 1.5),
      minKobo: num(env.FEE_MIN_NAIRA, 100) * 100,
      maxKobo: num(env.FEE_CAP_NAIRA, 3e3) * 100
    },
    processing: {
      percent: num(env.PROCESSING_PERCENT, 2),
      // Flutterwave's charge on local NGN collections
      capKobo: num(env.PROCESSING_CAP_NAIRA, 2e3) * 100,
      // Flutterwave's cap on that charge per payment
      payoutFeeKobo: Math.round(num(env.PAYOUT_FEE_NAIRA, 57.79) * 100)
      // ₦53.75 transfer fee + 7.5% VAT (worst case)
    },
    // Flutterwave settles collections into the wallet T+1, so seller payouts wait this long after payment.
    settlementHours: num(env.SETTLEMENT_HOURS, 24),
    maxTransferAttempts: 3,
    maxIdentityAttempts: 3,
    maxDealKobo: num(env.MAX_DEAL_NAIRA, 3e5) * 100,
    // The item price must be at least this many times the delivery fee, so a buyer who refuses a
    // correct item has paid enough to cover both delivery trips. 0 turns the rule off.
    minPriceDeliveryMultiple: num(env.MIN_PRICE_DELIVERY_MULTIPLE, 2),
    // Delivery prices used when LOGISTICS_PROVIDER=manual (your own riders). With Fez, the price
    // comes from Fez's /order/cost for the buyer's state instead.
    manualDelivery: {
      sameStateKobo: num(env.DELIVERY_SAME_STATE_NAIRA, 3e3) * 100,
      otherStateKobo: num(env.DELIVERY_OTHER_STATE_NAIRA, 6e3) * 100,
      vatPercent: num(env.DELIVERY_VAT_PERCENT, 7.5)
    },
    // Early-access code: removes the TrustGap fee from one deal per seller account and one order per
    // buyer phone number, until the end date (inclusive, Lagos time) or until it has been used
    // PROMO_MAX_USES times. Leave PROMO_CODE empty to switch the offer off.
    promo: {
      code: String(env.PROMO_CODE ?? "EARLYGAP").trim().toUpperCase(),
      endsAt: env.PROMO_ENDS === "" ? null : /* @__PURE__ */ new Date(`${env.PROMO_ENDS || "2027-01-31"}T23:59:59+01:00`),
      maxUses: num(env.PROMO_MAX_USES, 1e3)
    },
    inspectionHours: num(env.INSPECTION_HOURS, 24),
    paymentTimeoutMinutes: num(env.PAYMENT_TIMEOUT_MINUTES, 60),
    pinMaxAttempts: 5,
    otp: { ttlMinutes: 10, maxAttempts: 5, maxPerWindow: 3, windowMinutes: 15 },
    sessionDays: 30,
    riderLinkDays: 14,
    // How long the buyer has to hand a returned item to the courier before TrustGap staff step in.
    returnPickupDays: num(env.RETURN_PICKUP_DAYS, 3)
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
async function hmacHex(secret, message) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacHex, "hmacHex");
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
var PBKDF2_ROUNDS = 1e5;
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64url(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ROUNDS }, key, 256));
}
__name(pbkdf2, "pbkdf2");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ROUNDS}$${b64url(salt)}$${await pbkdf2(password, salt)}`;
}
__name(hashPassword, "hashPassword");
async function checkPassword(password, stored) {
  const [scheme, rounds, salt, hash] = String(stored || "").split("$");
  if (scheme !== "pbkdf2" || Number(rounds) !== PBKDF2_ROUNDS) return false;
  return safeEqual(await pbkdf2(String(password), fromB64url(salt)), hash);
}
__name(checkPassword, "checkPassword");

// src/providers/payments/flutterwave.js
function createFlutterwavePayments(ctx) {
  const { env, config } = ctx;
  const secretKey = String(env.FLW_SECRET_KEY || "").trim();
  if (!secretKey) throw new Error("FLW_SECRET_KEY is required when PAYMENT_PROVIDER=flutterwave");
  const isTest = secretKey.startsWith("FLWSECK_TEST");
  const blocked = isTest ? null : !secretKey.startsWith("FLWSECK-") ? "FLW_SECRET_KEY doesn\u2019t look like a Flutterwave v3 secret key (it should start with FLWSECK_TEST- or FLWSECK-). Copy it from Flutterwave \u2192 Settings \u2192 API keys." : String(env.ALLOW_LIVE_PAYMENTS).trim() !== "true" ? "A live Flutterwave key is set, but live payments are locked. Use your test key (FLWSECK_TEST-\u2026) or, only once holding customer money is approved, set ALLOW_LIVE_PAYMENTS = true." : null;
  const apiBase = env.FLW_API_BASE || "https://api.flutterwave.com/v3";
  async function call(method, path, body) {
    if (blocked) throw Object.assign(new Error(blocked), { definite: false, locked: true });
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
    blocked,
    async listBanks() {
      try {
        const data = await call("GET", "/banks/NG");
        return data.map((b) => ({ code: b.code, name: b.name })).sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        return NIGERIAN_BANKS;
      }
    },
    // Errors here are shown to the person as they are, so they're written in plain words.
    async resolveAccount({ bankCode, accountNumber }) {
      try {
        const data = await call("POST", "/accounts/resolve", { account_number: accountNumber, account_bank: bankCode });
        return { accountName: data.account_name };
      } catch (err) {
        if (err.locked) throw err;
        if (err.definite === false) {
          throw new Error("We couldn\u2019t reach the bank to check this account just now. Please try again in a minute.");
        }
        console.warn("account resolve refused", bankCode, err.message);
        throw new Error("We couldn\u2019t find that account number at that bank. Check both and try again." + (isTest ? " (Flutterwave test mode only recognises its test accounts, e.g. Access Bank 0690000032.)" : ""));
      }
    },
    async createCheckout({ order, title }) {
      const data = await call("POST", "/payments", {
        tx_ref: order.tx_ref,
        amount: order.amount / 100,
        currency: "NGN",
        redirect_url: `${config.apiUrl}/api/payments/callback`,
        customer: { email: order.buyer_email, phonenumber: order.buyer_phone, name: order.buyer_name },
        // Branding on Flutterwave's checkout page. The Flutterwave account belongs to Tubalcain Ads
        // Enterprise; this shows TrustGap's name and logo to buyers instead. (No "escrow" wording.)
        customizations: {
          title: "TrustGap",
          description: `${title} \xB7 Payment secured under TrustGap deal rules`.slice(0, 150),
          logo: config.checkoutLogoUrl
        },
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
    async quote({ pickupState, dropoffState }) {
      const { sameStateKobo, otherStateKobo, vatPercent } = ctx.config.manualDelivery;
      const base = pickupState === dropoffState ? sameStateKobo : otherStateKobo;
      return { feeKobo: Math.ceil(base * (100 + vatPercent) / 100 / 100) * 100 };
    },
    async book({ order }) {
      const expires = new Date(ctx.now().getTime() + ctx.config.riderLinkDays * 864e5);
      const token = await signLink(ctx.config.appSecret, `rider-${order.id}`, expires);
      return { deliveryRef: "MAN-" + order.ref, riderUrl: `${ctx.config.siteUrl}/rider.html?t=${encodeURIComponent(token)}` };
    },
    // A return: the rider collects from the buyer and enters the seller's return PIN at hand-back.
    async bookReturn({ order, riderToken }) {
      return { deliveryRef: "MAN-" + order.ref + "-R", riderUrl: `${ctx.config.siteUrl}/rider.html?t=${encodeURIComponent(riderToken)}` };
    },
    async getStatus() {
      return null;
    },
    async parseWebhook() {
      return null;
    }
  };
}
__name(createManualLogistics, "createManualLogistics");

// src/providers/logistics/fez.js
function mapFezStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s.includes("deliver")) return "delivered";
  if (s.includes("return")) return "returned";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("dispatch")) return "out_for_delivery";
  if (s.includes("picked")) return "picked_up";
  if (s.includes("failed") || s.includes("rejected")) return "problem";
  if (s.includes("pending payment")) return "awaiting_payment";
  return "booked";
}
__name(mapFezStatus, "mapFezStatus");
var session = null;
function parseFezExpiry(value) {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  return m ? Date.parse(`${m[1]}T${m[2]}+01:00`) : NaN;
}
__name(parseFezExpiry, "parseFezExpiry");
function createFezLogistics(ctx) {
  const { env } = ctx;
  if (!env.FEZ_USER_ID || !env.FEZ_PASSWORD) {
    throw new Error("FEZ_USER_ID and FEZ_PASSWORD are required when LOGISTICS_PROVIDER=fez");
  }
  const base = String(env.FEZ_API_BASE || "https://apisandbox.fezdelivery.co/v1").replace(/\/$/, "");
  async function send(method, path, body, auth) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...auth ? { "secret-key": auth.secretKey, Authorization: `Bearer ${auth.token}` } : {}
        },
        body: body ? JSON.stringify(body) : void 0
      });
    } catch (err) {
      throw new Error(`Fez unreachable: ${err.message}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.status).toLowerCase() === "error") {
      throw Object.assign(new Error(`Fez: ${data.description || data.message || res.status}`), { status: res.status });
    }
    return data;
  }
  __name(send, "send");
  async function login({ force = false } = {}) {
    const key = `${base}|${env.FEZ_USER_ID}`;
    if (!force && session?.key === key && session.expiresAt > ctx.now().getTime() + 5 * 6e4) return session;
    const data = await send("POST", "/user/authenticate", { user_id: env.FEZ_USER_ID, password: env.FEZ_PASSWORD });
    const token = data.authDetails?.authToken;
    const secretKey = env.FEZ_SECRET_KEY || data.orgDetails?.["secret-key"];
    if (!token) throw new Error("Fez login worked but returned no authToken.");
    if (!secretKey) throw new Error("Fez login returned no secret-key; set FEZ_SECRET_KEY.");
    const expiry = parseFezExpiry(data.authDetails?.expireToken);
    session = { key, token, secretKey, expiresAt: Number.isFinite(expiry) ? expiry : ctx.now().getTime() + 50 * 6e4 };
    return session;
  }
  __name(login, "login");
  async function call(method, path, body) {
    try {
      return await send(method, path, body, await login());
    } catch (err) {
      if (err.status !== 401) throw err;
      return send(method, path, body, await login({ force: true }));
    }
  }
  __name(call, "call");
  return {
    name: "fez",
    // POST /order/cost: the amount charged is cost + VAT ("totalCost").
    async quote({ pickupState, dropoffState, weightKg }) {
      const data = await call("POST", "/order/cost", { state: dropoffState, pickUpState: pickupState, weight: weightKg });
      const total = Number(data.totalCost ?? Number(data.cost?.cost ?? data.Cost?.cost) + Number(data.vat?.vatAmount || 0));
      if (!Number.isFinite(total) || total <= 0) throw new Error(`Fez returned no delivery price for ${dropoffState}.`);
      return { feeKobo: Math.ceil(total) * 100 };
    },
    // POST /order books the pickup. uniqueID is our order reference, and the buyer's delivery PIN
    // goes in CustToken (Fez's "token sent to recipient for confirmation of receipt").
    async book({ order, deal, seller, pin }) {
      const data = await call("POST", "/order", [
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
          additionalDetails: [order.delivery_landmark && `Landmark: ${order.delivery_landmark}`, order.packing_note && `Contents: ${order.packing_note}`, "Buyer gives a 4-digit PIN only after checking the item."].filter(Boolean).join(" | "),
          valueOfItem: String(Math.round(deal.item_price / 100)),
          weight: deal.weight_kg,
          pickUpState: deal.pickup_state,
          pickUpAddress: deal.pickup_address,
          thirdparty: "true",
          senderName: seller.business_name,
          senderAddress: deal.pickup_address,
          senderPhone: seller.phone,
          fragile: Boolean(deal.fragile)
        }
      ]);
      const orderNo = data.orderNos?.[order.ref];
      if (!orderNo) throw new Error(`Fez did not return an order number (${data.description || "no details"}).`);
      return { deliveryRef: orderNo, riderUrl: null };
    },
    // A return is a new Fez order the other way round: collected from the buyer, delivered to the
    // seller's pickup address. The seller's return PIN goes in CustToken, so Fez marks it delivered
    // only when the seller gives the rider that PIN.
    async bookReturn({ order, deal, seller, pin, ref }) {
      const data = await call("POST", "/order", [
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
          additionalDetails: [`Return for order ${order.ref}`, order.delivery_landmark && `Pickup landmark: ${order.delivery_landmark}`, "Seller gives a 4-digit PIN only after checking the item."].filter(Boolean).join(" | "),
          valueOfItem: String(Math.round(deal.item_price / 100)),
          weight: deal.weight_kg,
          pickUpState: order.delivery_state,
          pickUpAddress: order.delivery_address,
          thirdparty: "true",
          senderName: order.buyer_name,
          senderAddress: order.delivery_address,
          senderPhone: order.buyer_phone,
          fragile: Boolean(deal.fragile)
        }
      ]);
      const orderNo = data.orderNos?.[ref];
      if (!orderNo) throw new Error(`Fez did not return an order number (${data.description || "no details"}).`);
      return { deliveryRef: orderNo, riderUrl: null };
    },
    // GET /orders/{orderNo}
    async getStatus(orderNo) {
      const data = await call("GET", `/orders/${encodeURIComponent(orderNo)}`);
      const details = Array.isArray(data.orderDetails) ? data.orderDetails[0] : data.orderDetails;
      if (!details) return null;
      return { raw: details.orderStatus, stage: mapFezStatus(details.orderStatus), reason: details.returnReason || details.statusDescription || null };
    },
    // Fez's status webhook: { orderNumber, status } with X-Timestamp and
    // X-Signature = SHA-256 HMAC (hex) of orderNo + status + timestamp, keyed with your secret key.
    // It is only a hint: the status is always re-read with getStatus() before anything changes.
    async parseWebhook(request, body) {
      const orderNo = body?.orderNumber || body?.orderNo;
      const status = body?.status ?? body?.orderStatus ?? "";
      if (!orderNo) return null;
      const timestamp = request.headers.get("X-Timestamp") || "";
      const signature = (request.headers.get("X-Signature") || "").toLowerCase();
      const { secretKey } = await login();
      const expected = await hmacHex(secretKey, `${orderNo}${status}${timestamp}`);
      const fresh = Math.abs(ctx.now().getTime() / 1e3 - Number(timestamp)) < 15 * 60;
      return { deliveryRef: String(orderNo), signatureValid: safeEqual(signature, expected) && fresh };
    },
    // POST /webhooks/store
    async registerWebhook(url) {
      return call("POST", "/webhooks/store", { webhook: url });
    },
    // POST /order/cancel: only while Fez still allows it (before dispatch).
    async cancel(orderNo, reason) {
      return call("POST", "/order/cancel", { orderNo, reason: String(reason).slice(0, 255) });
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
  if (!make) throw new Error(`${kind} is "${name}", which isn't one of: ${Object.keys(options).join(", ")}. Fix it under Settings \u2192 Variables.`);
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

// src/schema.js
var MIGRATIONS = [
  {
    "name": "0001_init.sql",
    "sql": "-- TrustGap schema for Cloudflare D1 (SQLite). Money is integer kobo; times are ISO-8601 UTC strings.\n\nCREATE TABLE sellers (\n  id INTEGER PRIMARY KEY,\n  full_name TEXT NOT NULL,\n  business_name TEXT NOT NULL,\n  phone TEXT NOT NULL UNIQUE,\n  email TEXT NOT NULL,\n  phone_verified_at TEXT,\n  pickup_address TEXT,\n  pickup_zone TEXT,\n  payout_bank_code TEXT,\n  payout_bank_name TEXT,\n  payout_account_number TEXT,\n  payout_account_name TEXT,\n  payout_verified_at TEXT,\n  id_type TEXT,\n  id_last4 TEXT,\n  id_verified_name TEXT,\n  id_provider_ref TEXT,\n  identity_verified_at TEXT,\n  amount_owed INTEGER NOT NULL DEFAULT 0,\n  suspended_at TEXT,\n  created_at TEXT NOT NULL\n);\n\nCREATE TABLE sessions (\n  token_hash TEXT PRIMARY KEY,\n  seller_id INTEGER REFERENCES sellers(id),\n  is_admin INTEGER NOT NULL DEFAULT 0,\n  expires_at TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);\n\nCREATE TABLE otps (\n  id INTEGER PRIMARY KEY,\n  phone TEXT NOT NULL,\n  code_hash TEXT NOT NULL,\n  attempts INTEGER NOT NULL DEFAULT 0,\n  expires_at TEXT NOT NULL,\n  consumed_at TEXT,\n  created_at TEXT NOT NULL\n);\nCREATE INDEX otps_phone ON otps(phone, created_at);\n\nCREATE TABLE deals (\n  id INTEGER PRIMARY KEY,\n  token TEXT NOT NULL UNIQUE,\n  seller_id INTEGER NOT NULL REFERENCES sellers(id),\n  replaces_deal_id INTEGER REFERENCES deals(id),\n  item_title TEXT NOT NULL,\n  item_description TEXT NOT NULL,\n  item_condition TEXT NOT NULL,\n  quantity INTEGER NOT NULL,\n  item_price INTEGER NOT NULL,\n  pickup_address TEXT NOT NULL,\n  pickup_zone TEXT NOT NULL,\n  delivery_zone TEXT NOT NULL,\n  delivery_fee INTEGER NOT NULL,\n  delivery_payer TEXT NOT NULL,\n  fee_payer TEXT NOT NULL,\n  platform_fee INTEGER NOT NULL,\n  buyer_total INTEGER NOT NULL,\n  seller_payout INTEGER NOT NULL,\n  delivery_days INTEGER NOT NULL,\n  inspection_hours INTEGER NOT NULL,\n  status TEXT NOT NULL,\n  expires_at TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);\nCREATE INDEX deals_seller ON deals(seller_id, status);\n\nCREATE TABLE checkouts (\n  id TEXT PRIMARY KEY,\n  deal_id INTEGER NOT NULL REFERENCES deals(id),\n  terms_json TEXT NOT NULL,\n  terms_hash TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);\n\nCREATE TABLE orders (\n  id INTEGER PRIMARY KEY,\n  ref TEXT NOT NULL UNIQUE,\n  deal_id INTEGER NOT NULL REFERENCES deals(id),\n  seller_id INTEGER NOT NULL REFERENCES sellers(id),\n  buyer_token TEXT NOT NULL UNIQUE,\n  buyer_name TEXT NOT NULL,\n  buyer_phone TEXT NOT NULL,\n  buyer_email TEXT NOT NULL,\n  delivery_address TEXT NOT NULL,\n  delivery_landmark TEXT,\n  refund_bank_code TEXT NOT NULL,\n  refund_bank_name TEXT NOT NULL,\n  refund_account_enc TEXT NOT NULL,\n  refund_account_last4 TEXT NOT NULL,\n  refund_account_name TEXT NOT NULL,\n  terms_json TEXT NOT NULL,\n  terms_hash TEXT NOT NULL,\n  terms_accepted_at TEXT NOT NULL,\n  amount INTEGER NOT NULL,\n  status TEXT NOT NULL,\n  last_transition TEXT,\n  tx_ref TEXT NOT NULL UNIQUE,\n  provider_tx_id TEXT,\n  paid_at TEXT,\n  delivery_pin_enc TEXT,\n  pin_attempts INTEGER NOT NULL DEFAULT 0,\n  delivery_ref TEXT,\n  rider_url TEXT,\n  delivery_status TEXT NOT NULL DEFAULT 'not_booked',\n  packing_note TEXT,\n  ship_by TEXT,\n  dispatched_at TEXT,\n  delivered_at TEXT,\n  inspection_ends_at TEXT,\n  closed_at TEXT,\n  created_at TEXT NOT NULL\n);\n-- A deal can be paid for only once, however many checkout attempts it had.\nCREATE UNIQUE INDEX orders_one_paid_per_deal\n  ON orders(deal_id) WHERE status IN ('paid', 'shipping', 'delivered', 'disputed', 'completed', 'refunded');\nCREATE INDEX orders_status ON orders(status);\nCREATE INDEX orders_seller ON orders(seller_id);\n\nCREATE TABLE order_events (\n  id INTEGER PRIMARY KEY,\n  order_id INTEGER NOT NULL REFERENCES orders(id),\n  actor TEXT NOT NULL,\n  type TEXT NOT NULL,\n  detail TEXT,\n  created_at TEXT NOT NULL\n);\nCREATE INDEX order_events_order ON order_events(order_id);\n\nCREATE TABLE disputes (\n  id INTEGER PRIMARY KEY,\n  order_id INTEGER NOT NULL REFERENCES orders(id),\n  opened_by TEXT NOT NULL,\n  category TEXT NOT NULL,\n  description TEXT NOT NULL,\n  status TEXT NOT NULL,\n  resolution_note TEXT,\n  buyer_refund INTEGER,\n  seller_payout INTEGER,\n  seller_charge INTEGER,\n  created_at TEXT NOT NULL,\n  resolved_at TEXT\n);\n\nCREATE TABLE ledger (\n  id INTEGER PRIMARY KEY,\n  order_id INTEGER REFERENCES orders(id),\n  kind TEXT NOT NULL,\n  amount INTEGER NOT NULL,\n  counterparty TEXT,\n  provider_ref TEXT,\n  status TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);\nCREATE INDEX ledger_order ON ledger(order_id);\n\n-- Messages handed to Make.com (which sends SMS via KudiSMS and email).\nCREATE TABLE outbox (\n  id INTEGER PRIMARY KEY,\n  order_id INTEGER,\n  event TEXT NOT NULL,\n  to_phone TEXT,\n  to_email TEXT,\n  sms TEXT,\n  email_subject TEXT,\n  status TEXT NOT NULL,\n  attempts INTEGER NOT NULL DEFAULT 0,\n  last_error TEXT,\n  created_at TEXT NOT NULL\n);\nCREATE INDEX outbox_status ON outbox(status);\n\nCREATE TABLE mock_transactions (\n  tx_ref TEXT PRIMARY KEY,\n  amount INTEGER NOT NULL,\n  status TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);\n\nCREATE TABLE meta (\n  key TEXT PRIMARY KEY,\n  value TEXT\n);\n"
  },
  {
    "name": "0002_processing_payouts_identity.sql",
    "sql": "-- Payment processing line (Flutterwave's costs, passed on at cost) stored per deal.\nALTER TABLE deals ADD COLUMN processing_fee INTEGER NOT NULL DEFAULT 0;\n\n-- Payouts: a stable reference per attempt (Flutterwave's idempotency key), the attempt number,\n-- and the earliest time a payout may be sent (after the buyer's payment settles, T+1).\nALTER TABLE ledger ADD COLUMN transfer_ref TEXT;\nALTER TABLE ledger ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;\nALTER TABLE ledger ADD COLUMN not_before TEXT;\nALTER TABLE ledger ADD COLUMN last_error TEXT;\nCREATE INDEX ledger_status ON ledger(status, not_before);\nCREATE UNIQUE INDEX ledger_transfer_ref ON ledger(transfer_ref) WHERE transfer_ref IS NOT NULL;\n\n-- Each NIN check costs money, so failed attempts are counted and capped.\nALTER TABLE sellers ADD COLUMN id_attempts INTEGER NOT NULL DEFAULT 0;\n"
  },
  {
    "name": "0003_states_and_courier.sql",
    "sql": `-- Delivery is priced per order by the courier (Fez) from the buyer's address, instead of from
-- fixed areas chosen by the seller. Links keep the pickup address/state and parcel details;
-- the final delivery fee, processing fee and seller payout are stored on the order.
ALTER TABLE deals ADD COLUMN pickup_state TEXT;
ALTER TABLE deals ADD COLUMN weight_kg INTEGER NOT NULL DEFAULT 1;
ALTER TABLE deals ADD COLUMN fragile INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sellers ADD COLUMN pickup_state TEXT;

ALTER TABLE orders ADD COLUMN delivery_state TEXT;
ALTER TABLE orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN platform_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN processing_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN seller_payout INTEGER NOT NULL DEFAULT 0;
-- Which courier carries the parcel ("manual" rider link or "fez") and the courier's own status text.
ALTER TABLE orders ADD COLUMN courier TEXT;
ALTER TABLE orders ADD COLUMN courier_status TEXT;
CREATE INDEX orders_delivery_ref ON orders(delivery_ref);
`
  },
  {
    "name": "0004_seller_sets_delivery_address.sql",
    "sql": "-- The seller puts the buyer's delivery address on the link (from the chat), so the delivery fee is\n-- known and shown to both sides before anyone pays. The buyer confirms it read-only in step 1.\nALTER TABLE deals ADD COLUMN delivery_address TEXT;\nALTER TABLE deals ADD COLUMN delivery_landmark TEXT;\nALTER TABLE deals ADD COLUMN delivery_state TEXT;\n"
  },
  {
    "name": "0005_item_photos.sql",
    "sql": "-- Photos of the item, added by the seller with the link. The buyer sees them before paying, their\n-- fingerprints are part of the terms the buyer accepts, and they stay with the order as evidence.\nCREATE TABLE IF NOT EXISTS deal_photos (\n  id INTEGER PRIMARY KEY,\n  deal_id INTEGER NOT NULL REFERENCES deals(id),\n  position INTEGER NOT NULL,\n  mime TEXT NOT NULL,\n  data BLOB NOT NULL,\n  sha256 TEXT NOT NULL,\n  bytes INTEGER NOT NULL,\n  created_at TEXT NOT NULL,\n  UNIQUE (deal_id, position)\n);\nALTER TABLE deals ADD COLUMN photo_count INTEGER NOT NULL DEFAULT 0;\n"
  },
  {
    "name": "0006_early_access_code.sql",
    "sql": "-- Early-access code: removes the TrustGap fee (1.5%) from one deal. A seller can use it on one link\n-- (the whole fee is removed); a buyer can use it on one order (their share of the fee is removed).\nALTER TABLE deals ADD COLUMN promo_code TEXT;\nALTER TABLE orders ADD COLUMN promo_code TEXT;\nALTER TABLE orders ADD COLUMN promo_discount INTEGER NOT NULL DEFAULT 0;\n"
  },
  {
    "name": "0007_dispute_photos.sql",
    "sql": "-- Photos the buyer attaches when reporting a problem (up to 2). Private evidence: only TrustGap staff\n-- and the buyer can open them, through signed links that expire.\nCREATE TABLE IF NOT EXISTS dispute_photos (\n  id INTEGER PRIMARY KEY,\n  dispute_id INTEGER NOT NULL REFERENCES disputes(id),\n  position INTEGER NOT NULL,\n  mime TEXT NOT NULL,\n  data BLOB NOT NULL,\n  sha256 TEXT NOT NULL,\n  bytes INTEGER NOT NULL,\n  created_at TEXT NOT NULL,\n  UNIQUE (dispute_id, position)\n);\n"
  },
  {
    "name": "0008_debt_payments_consents_marketing.sql",
    "sql": "-- Sellers can pay a dispute charge straight away through the payment page, instead of only having it\n-- taken from a later payout.\nCREATE TABLE IF NOT EXISTS debt_payments (\n  id INTEGER PRIMARY KEY,\n  seller_id INTEGER NOT NULL REFERENCES sellers(id),\n  amount INTEGER NOT NULL,\n  tx_ref TEXT NOT NULL UNIQUE,\n  status TEXT NOT NULL,\n  confirm_nonce TEXT,\n  provider_tx_id TEXT,\n  created_at TEXT NOT NULL,\n  paid_at TEXT\n);\n-- What each side confirmed before the deal: the seller's condition pledge (exact wording) and the time\n-- the buyer accepted the change-of-mind notice (its wording is in the order's accepted terms).\nALTER TABLE deals ADD COLUMN condition_confirmed_at TEXT;\nALTER TABLE deals ADD COLUMN condition_pledge TEXT;\nALTER TABLE orders ADD COLUMN buyer_ack_at TEXT;\n-- Opt-ins for TrustGap news and offers (separate from the messages needed to run a deal).\nALTER TABLE sellers ADD COLUMN marketing_opt_in_at TEXT;\nALTER TABLE orders ADD COLUMN buyer_marketing_opt_in_at TEXT;\n"
  },
  {
    "name": "0009_terms_of_service_acceptance.sql",
    "sql": "-- Acceptance of the TrustGap Terms of Service (a required, unticked checkbox). Sellers accept when\n-- signing up; buyers accept in step 1 of each deal (the version and time are also in the order's\n-- accepted terms).\nALTER TABLE sellers ADD COLUMN terms_accepted_at TEXT;\nALTER TABLE sellers ADD COLUMN terms_version TEXT;\nALTER TABLE orders ADD COLUMN buyer_terms_accepted_at TEXT;\n"
  },
  {
    "name": "0010_returns.sql",
    "sql": `-- Returns to the seller. The buyer's refund waits until the seller has the item back, confirmed by
-- the seller's 4-digit return PIN (given to the rider at hand-back), the courier's own record, the
-- seller's "I've received it" button, or TrustGap staff.
--   kind 'door':   refused at the door; the same rider takes the parcel straight back.
--   kind 'pickup': a problem found after delivery; a new courier order collects it from the buyer.
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  pin_enc TEXT NOT NULL,
  pin_attempts INTEGER NOT NULL DEFAULT 0,
  courier TEXT,
  delivery_ref TEXT,
  rider_url TEXT,
  courier_status TEXT,
  cost INTEGER,
  deadline_at TEXT,
  received_at TEXT,
  received_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS returns_order ON returns(order_id);
`
  },
  {
    "name": "0011_team_and_tasks.sql",
    "sql": "-- Team members (e.g. customer relations) with their own password, and tasks the admin assigns them.\nCREATE TABLE IF NOT EXISTS staff (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL UNIQUE,\n  phone TEXT,\n  role TEXT NOT NULL,\n  password_hash TEXT NOT NULL,\n  must_change_password INTEGER NOT NULL DEFAULT 1,\n  disabled_at TEXT,\n  last_login_at TEXT,\n  created_at TEXT NOT NULL\n);\nALTER TABLE sessions ADD COLUMN staff_id INTEGER;\n\nCREATE TABLE IF NOT EXISTS tasks (\n  id INTEGER PRIMARY KEY,\n  title TEXT NOT NULL,\n  details TEXT,\n  order_id INTEGER REFERENCES orders(id),\n  assigned_to INTEGER REFERENCES staff(id),\n  priority TEXT NOT NULL DEFAULT 'normal',\n  status TEXT NOT NULL DEFAULT 'todo',\n  due_at TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  completed_at TEXT\n);\nCREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assigned_to, status);\n\nCREATE TABLE IF NOT EXISTS task_notes (\n  id INTEGER PRIMARY KEY,\n  task_id INTEGER NOT NULL REFERENCES tasks(id),\n  author TEXT NOT NULL,\n  body TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);\nCREATE INDEX IF NOT EXISTS task_notes_task ON task_notes(task_id);\n"
  },
  {
    "name": "0012_team_dispute_decisions.sql",
    "sql": `-- "Decide a dispute" tasks: the admin can let a team member decide one order's dispute. Each
-- decision records who made it.
ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'general';
ALTER TABLE disputes ADD COLUMN decided_by TEXT;
`
  },
  {
    "name": "0013_photo_evidence.sql",
    "sql": "-- How each evidence photo was taken, and what TrustGap's checks found:\n--   source       'camera' (TrustGap's in-page camera, stamped) or 'upload' (chosen from the phone)\n--   stamp_code   the code stamped on a camera photo; captured_at is when TrustGap issued it\n--   phash        a 64-bit picture fingerprint, to spot a photo copied from the listing or reused\n--   flags        JSON list of warnings for whoever decides (e.g. old photo, copy of listing photo)\nALTER TABLE dispute_photos ADD COLUMN source TEXT;\nALTER TABLE dispute_photos ADD COLUMN stamp_code TEXT;\nALTER TABLE dispute_photos ADD COLUMN captured_at TEXT;\nALTER TABLE dispute_photos ADD COLUMN phash TEXT;\nALTER TABLE dispute_photos ADD COLUMN flags TEXT;\nALTER TABLE deal_photos ADD COLUMN phash TEXT;\n-- A return the seller accepted but reported as not the item that was delivered.\nALTER TABLE returns ADD COLUMN problem_at TEXT;\nALTER TABLE returns ADD COLUMN problem_note TEXT;\n"
  }
];

// src/lib/migrate.js
function splitStatements(sql) {
  return sql.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
}
__name(splitStatements, "splitStatements");
async function appliedMigrations(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  const names = new Set((await db.prepare("SELECT name FROM _migrations").all()).results.map((r) => r.name));
  const wrangler = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'").first();
  if (wrangler) for (const r of (await db.prepare("SELECT name FROM d1_migrations").all()).results) names.add(r.name);
  return names;
}
__name(appliedMigrations, "appliedMigrations");
async function migrate(db) {
  let applied = await appliedMigrations(db);
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    const statements = splitStatements(m.sql).map((s) => db.prepare(s));
    statements.push(db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").bind(m.name, (/* @__PURE__ */ new Date()).toISOString()));
    try {
      await db.batch(statements);
    } catch (err) {
      applied = await appliedMigrations(db);
      if (!applied.has(m.name)) throw new Error(`Database setup (${m.name}) failed: ${err.message}`);
    }
  }
}
__name(migrate, "migrate");
var ready = /* @__PURE__ */ new WeakMap();
function ensureSchema(env) {
  if (!env.DB) return Promise.reject(new Error("No D1 binding called DB. Add it under Settings \u2192 Bindings."));
  let p = ready.get(env.DB);
  if (!p) {
    p = migrate(env.DB).catch((err) => {
      ready.delete(env.DB);
      throw err;
    });
    ready.set(env.DB, p);
  }
  return p;
}
__name(ensureSchema, "ensureSchema");

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
  const pf = Math.max(fee.minKobo, Math.round(itemPriceKobo * fee.percent / 100));
  return fee.maxKobo ? Math.min(fee.maxKobo, pf) : pf;
}
__name(platformFee, "platformFee");
var ceilNaira = /* @__PURE__ */ __name((kobo) => Math.ceil(kobo / 100) * 100, "ceilNaira");
function processingFee({ itemPrice, buyerDelivery, platform, buyerShare }, processing) {
  const r = processing.percent / 100;
  const roundingAllowance = buyerShare === 0.5 ? 200 : 0;
  const pr = (r * (itemPrice + buyerDelivery + buyerShare * platform + roundingAllowance) + processing.payoutFeeKobo) / (1 - r * buyerShare);
  return ceilNaira(processing.capKobo ? Math.min(pr, processing.capKobo + processing.payoutFeeKobo) : pr);
}
__name(processingFee, "processingFee");
var buyerPart = /* @__PURE__ */ __name((payer, amount) => payer === "buyer" ? amount : payer === "split" ? Math.ceil(amount / 200) * 100 : 0, "buyerPart");
function splitCharges({ itemPrice, deliveryFee, deliveryPayer, feePayer, platformFee: pf, processingFee: pr }) {
  const buyerDelivery = buyerPart(deliveryPayer, deliveryFee);
  const buyerPlatformShare = buyerPart(feePayer, pf);
  const buyerProcessingShare = buyerPart(feePayer, pr);
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

// src/lib/states.js
var STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara"
];
var ALIASES = { abuja: "FCT", "federal capital territory": "FCT", "fct abuja": "FCT", "abuja fct": "FCT", nassarawa: "Nasarawa" };
function normaliseState(input) {
  const s = String(input ?? "").trim().toLowerCase().replace(/\s+state$/, "").replace(/\s+/g, " ");
  if (!s) return null;
  if (ALIASES[s]) return ALIASES[s];
  return STATES.find((st) => st.toLowerCase() === s) || null;
}
__name(normaliseState, "normaliseState");

// src/lib/terms.js
var TERMS_VERSION = "2026-10-pilot-1";
var TOS_VERSION = "2026-10-29";
var TOS_DOCUMENTS = {
  seller: ["legal/terms.html", "legal/seller-terms.html", "legal/privacy.html"],
  buyer: ["legal/terms.html", "legal/disputes.html", "legal/privacy.html"]
};
var yes = /* @__PURE__ */ __name((v) => v === true || v === "yes", "yes");
var acceptedTerms = /* @__PURE__ */ __name((input) => yes(input?.terms_accepted), "acceptedTerms");
var RULES = /* @__PURE__ */ __name((deal) => [
  "Your payment is held by TrustGap. The seller is not paid until the item is delivered and the inspection period ends.",
  "Check the item at the door. Only give the rider your 4-digit delivery PIN if it matches this description.",
  `After delivery you have ${deal.inspection_hours} hours to report a hidden problem. If you report nothing, the seller is paid automatically.`,
  `If the seller does not hand the item to the courier within ${deal.delivery_days} day(s), you get a full refund.`,
  "Wrong, fake, damaged or not-as-described item: the item goes back to the seller and you get a full refund.",
  "If you refuse a correct item, the cost of delivery and return may be deducted from your refund. Every deduction is shown to you in writing.",
  "Disputes are decided by TrustGap staff using evidence from both sides and the courier. You can appeal once by replying to the decision."
], "RULES");
async function snapshotTerms(deal, seller, photoHashes = [], promo = null, acknowledgedAt = null, tosAcceptedAt = null) {
  const terms = {
    version: TERMS_VERSION,
    deal_token: deal.token,
    seller: { business_name: seller.business_name, identity_verified: Boolean(seller.identity_verified_at) },
    item: {
      title: deal.item_title,
      description: deal.item_description,
      condition: deal.item_condition,
      quantity: deal.quantity,
      photos_sha256: photoHashes
    },
    money: {
      item_price: deal.item_price,
      delivery_fee: deal.delivery_fee,
      delivery_payer: deal.delivery_payer,
      platform_fee: deal.platform_fee,
      processing_fee: deal.processing_fee,
      fee_payer: deal.fee_payer,
      promo_code: promo?.code || deal.promo_code || null,
      promo_discount: promo?.discount || 0,
      buyer_total: deal.buyer_total - (promo?.discount || 0)
    },
    delivery: {
      address: deal.delivery_address,
      landmark: deal.delivery_landmark,
      state: deal.delivery_state,
      ships_from: deal.pickup_state,
      ship_within_days: deal.delivery_days,
      weight_kg: deal.weight_kg
    },
    inspection_hours: deal.inspection_hours,
    rules: RULES(deal),
    // The change-of-mind notice the buyer accepted in a pop-up before continuing (exact wording).
    buyer_acknowledgement: acknowledgedAt && { text: fillConsent("buyer", deal.delivery_fee), at: acknowledgedAt },
    // The buyer ticked "I agree to the TrustGap Terms of Service" in step 1.
    terms_of_service: tosAcceptedAt && { version: TOS_VERSION, documents: TOS_DOCUMENTS.buyer, at: tosAcceptedAt }
  };
  const json2 = JSON.stringify(terms);
  return { json: json2, hash: await sha256Hex(json2) };
}
__name(snapshotTerms, "snapshotTerms");
var CONSENTS = {
  seller: {
    title: "Is the item in good condition, exactly as agreed with the buyer?",
    body: "If the buyer reports a problem and TrustGap finds the item was not in the condition you described, the buyer\u2019s money is refunded and you pay for the delivery and the return of the item: twice the delivery fee ({fee}).",
    confirm: "The item is in good condition as agreed"
  },
  buyer: {
    title: "Before you pay: changing your mind has a cost",
    body: "Once you pay, the seller sends the item. If you change your mind after paying, or refuse or send back an item that matches this description when it reaches you, the delivery and the return are paid from your refund: twice the delivery fee ({fee}). If the item is wrong, damaged, fake or not as described, you get a full refund.",
    confirm: "I understand. Continue"
  }
};
var fillConsent = /* @__PURE__ */ __name((who, deliveryFeeKobo) => `${CONSENTS[who].title} ${CONSENTS[who].body.replace("{fee}", formatNaira(2 * deliveryFeeKobo))}`, "fillConsent");

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
  returned_by_courier: "Returned by the courier",
  not_shipped: "Seller did not ship in time",
  seller_issue: "Raised by seller",
  returned_item_problem: "Returned item isn\u2019t what was delivered"
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

// src/core/debts.js
var isDebtRef = /* @__PURE__ */ __name((txRef) => String(txRef || "").startsWith("TGD-"), "isDebtRef");
async function startDebtPayment(ctx, seller) {
  if (!(seller.amount_owed > 0)) throw new UserError("You don\u2019t owe anything.");
  const txRef = "TGD-" + randomToken(12);
  const id = await insert(ctx.env, "debt_payments", {
    seller_id: seller.id,
    amount: seller.amount_owed,
    tx_ref: txRef,
    status: "pending",
    created_at: iso(ctx.now())
  });
  const { url } = await ctx.payments.createCheckout({
    order: { tx_ref: txRef, amount: seller.amount_owed, ref: `DEBT-${id}`, buyer_email: seller.email, buyer_phone: seller.phone, buyer_name: seller.full_name },
    title: "Settle your TrustGap balance"
  });
  return { payment_url: url, amount: seller.amount_owed };
}
__name(startDebtPayment, "startDebtPayment");
async function confirmDebtPayment(ctx, txRef) {
  const row = await first(ctx.env, "SELECT * FROM debt_payments WHERE tx_ref = ?", txRef);
  if (!row) return null;
  if (row.status !== "pending") return row;
  const v = await ctx.payments.verify(txRef);
  if (v.status === "failed") {
    await stmt(ctx.env, "UPDATE debt_payments SET status = 'failed' WHERE id = ? AND status = 'pending'", row.id).run();
    return { ...row, status: "failed" };
  }
  if (v.status !== "successful") return row;
  if (v.currency !== "NGN" || v.amount < row.amount) {
    await stmt(ctx.env, "UPDATE debt_payments SET status = 'amount_mismatch', provider_tx_id = ? WHERE id = ? AND status = 'pending'", v.providerTxId, row.id).run();
    console.error("debt payment amount mismatch", txRef, v.amount, row.amount);
    return { ...row, status: "amount_mismatch" };
  }
  const nonce = randomToken(12);
  const [won] = await ctx.env.DB.batch([
    stmt(
      ctx.env,
      "UPDATE debt_payments SET status = 'paid', paid_at = ?, provider_tx_id = ?, confirm_nonce = ? WHERE id = ? AND status = 'pending'",
      iso(ctx.now()),
      v.providerTxId,
      nonce,
      row.id
    ),
    stmt(ctx.env, `UPDATE sellers SET amount_owed = MAX(0, amount_owed - ?) WHERE id = ?
      AND EXISTS (SELECT 1 FROM debt_payments WHERE id = ? AND confirm_nonce = ?)`, row.amount, row.seller_id, row.id, nonce)
  ]);
  if (won.meta.changes === 1) {
    const seller = await getSeller(ctx, row.seller_id);
    await ctx.notify.send({
      event: "debt_paid",
      phone: seller.phone,
      email: seller.email,
      sms: `TrustGap: we received ${formatNaira(row.amount)}. ${seller.amount_owed > 0 ? `You still owe ${formatNaira(seller.amount_owed)}.` : "Your balance is cleared. You can create links again."}`
    });
  }
  return first(ctx.env, "SELECT * FROM debt_payments WHERE id = ?", row.id);
}
__name(confirmDebtPayment, "confirmDebtPayment");

// src/lib/photos.js
var MAX_PHOTOS = 4;
var MAX_PHOTO_BYTES = 600 * 1024;
async function parsePhotos(input, max = MAX_PHOTOS) {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  if (list.length > max) throw new UserError(`Add up to ${max} photos.`);
  const photos = [];
  for (const entry of list) {
    const item = entry && typeof entry === "object" ? entry.data : entry;
    const meta = entry && typeof entry === "object" ? entry : {};
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(item));
    if (!m) throw new UserError("Each photo must be a JPEG image. Try adding it again.");
    let bytes;
    try {
      bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
    } catch {
      throw new UserError("A photo could not be read. Try adding it again.");
    }
    if (bytes.length > MAX_PHOTO_BYTES) throw new UserError("A photo is too large. Try a smaller one.");
    const clean = stripJpegMetadata(bytes);
    photos.push({
      mime: "image/jpeg",
      data: clean,
      bytes: clean.length,
      sha256: await sha256Bytes(clean),
      phash: /^[0-9a-f]{16}$/.test(String(meta.phash || "")) ? meta.phash : null,
      source: meta.source === "camera" ? "camera" : "upload",
      stampToken: meta.source === "camera" ? String(meta.stamp_token || "").slice(0, 300) : null,
      takenAt: meta.taken_at && !Number.isNaN(new Date(meta.taken_at).getTime()) ? new Date(meta.taken_at).toISOString() : null,
      cameraInfo: meta.camera_info === true
    });
  }
  return photos;
}
__name(parsePhotos, "parsePhotos");
function stripJpegMetadata(b) {
  if (b[0] !== 255 || b[1] !== 216) throw new UserError("Each photo must be a JPEG image. Try adding it again.");
  const out = [b.subarray(0, 2)];
  let i = 2;
  let imageData = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 255) throw new UserError("A photo is damaged. Try adding it again.");
    const marker = b[i + 1];
    if (marker === 218) {
      out.push(b.subarray(i));
      imageData = true;
      break;
    }
    const len = b[i + 2] << 8 | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) throw new UserError("A photo is damaged. Try adding it again.");
    if (marker !== 225 && marker !== 237 && marker !== 254) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  if (!imageData) throw new UserError("A photo is damaged. Try adding it again.");
  const size = out.reduce((n, p) => n + p.length, 0);
  const clean = new Uint8Array(size);
  let at = 0;
  for (const p of out) {
    clean.set(p, at);
    at += p.length;
  }
  return clean;
}
__name(stripJpegMetadata, "stripJpegMetadata");
async function sha256Bytes(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(sha256Bytes, "sha256Bytes");
var EVIDENCE_LINK_HOURS = 2;
var photoUrls = /* @__PURE__ */ __name((ctx, deal, rows) => rows.map((p) => `${ctx.config.apiUrl}/api/deals/${encodeURIComponent(deal.token)}/photos/${p.position}?v=${p.sha256.slice(0, 10)}`), "photoUrls");

// src/core/promo.js
var normaliseCode = /* @__PURE__ */ __name((v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, ""), "normaliseCode");
async function checkPromo(ctx, input) {
  const code = normaliseCode(input);
  if (!code) return null;
  const p = ctx.config.promo;
  if (!p.code || code !== p.code) throw new UserError("That code isn\u2019t valid. Check it and try again.");
  if (p.endsAt && ctx.now() > p.endsAt) throw new UserError("This early-access code has expired.");
  const used = await first(ctx.env, `SELECT
      (SELECT COUNT(*) FROM deals WHERE promo_code = ? AND status NOT IN ('expired', 'cancelled', 'replaced'))
    + (SELECT COUNT(*) FROM orders WHERE promo_code = ? AND status NOT IN ('awaiting_payment', 'cancelled')) AS n`, code, code);
  if (used.n >= p.maxUses) throw new UserError("This early-access offer has been fully used.");
  return code;
}
__name(checkPromo, "checkPromo");
async function checkSellerPromo(ctx, seller, input, revising = null) {
  const code = await checkPromo(ctx, input);
  if (!code) return null;
  const used = await first(
    ctx.env,
    "SELECT id FROM deals WHERE seller_id = ? AND promo_code = ? AND status NOT IN ('expired', 'cancelled', 'replaced') AND id IS NOT ?",
    seller.id,
    code,
    revising
  );
  if (used) throw new UserError("You have already used your early-access code on another link.");
  return code;
}
__name(checkSellerPromo, "checkSellerPromo");
async function buyerUsedPromo(ctx, phone, code) {
  return Boolean(await first(
    ctx.env,
    "SELECT id FROM orders WHERE buyer_phone = ? AND promo_code = ? AND status NOT IN ('awaiting_payment', 'cancelled')",
    phone,
    code
  ));
}
__name(buyerUsedPromo, "buyerUsedPromo");

// src/core/deals.js
var PAYERS = ["buyer", "seller", "split"];
function pricingInput(ctx, input) {
  const itemPrice = nairaToKobo(input.item_price);
  if (itemPrice == null || itemPrice < 500 * 100) throw new UserError("Price must be at least \u20A6500.");
  if (itemPrice > ctx.config.maxDealKobo) {
    throw new UserError(`During the pilot, deals are limited to ${formatNaira(ctx.config.maxDealKobo)}.`);
  }
  const pickupState = normaliseState(input.pickup_state);
  if (!pickupState) throw new UserError("Enter the state you ship from (one of the 36 states or FCT).");
  const deliveryState = normaliseState(input.delivery_state);
  if (!deliveryState) throw new UserError("Enter the buyer's state (one of the 36 states or FCT).");
  const weightKg = Math.ceil(Number(input.weight_kg ?? 1));
  if (!Number.isFinite(weightKg) || weightKg < 1 || weightKg > 100) throw new UserError("Parcel weight must be 1 to 100 kg.");
  const deliveryPayer = str(input.delivery_payer);
  const feePayer = str(input.fee_payer);
  if (!PAYERS.includes(deliveryPayer)) throw new UserError("Choose who pays for delivery.");
  if (!PAYERS.includes(feePayer)) throw new UserError("Choose who pays the TrustGap fee.");
  return { itemPrice, pickupState, deliveryState, weightKg, deliveryPayer, feePayer };
}
__name(pricingInput, "pricingInput");
async function priceDeal(ctx, p, { promo = false } = {}) {
  let deliveryFee;
  try {
    ({ feeKobo: deliveryFee } = await ctx.logistics.quote({ pickupState: p.pickupState, dropoffState: p.deliveryState, weightKg: p.weightKg }));
  } catch (err) {
    throw new UserError(`We couldn't get a delivery price right now (${err.message}). Please try again in a moment.`, 503);
  }
  const minPrice = ctx.config.minPriceDeliveryMultiple * deliveryFee;
  if (minPrice && p.itemPrice < minPrice) {
    throw new UserError(`For delivery to ${p.deliveryState} (${formatNaira(deliveryFee)}), the item price must be at least ${formatNaira(minPrice)}: ${ctx.config.minPriceDeliveryMultiple === 2 ? "twice" : `${ctx.config.minPriceDeliveryMultiple} times`} the delivery fee, so a return is always covered.`);
  }
  const pf = promo ? 0 : platformFee(p.itemPrice, ctx.config.fee);
  const buyerShare = p.feePayer === "buyer" ? 1 : p.feePayer === "split" ? 0.5 : 0;
  const pr = processingFee(
    { itemPrice: p.itemPrice, buyerDelivery: buyerPart(p.deliveryPayer, deliveryFee), platform: pf, buyerShare },
    ctx.config.processing
  );
  const q = splitCharges({ itemPrice: p.itemPrice, deliveryFee, deliveryPayer: p.deliveryPayer, feePayer: p.feePayer, platformFee: pf, processingFee: pr });
  if (q.sellerPayout <= 0) {
    throw new UserError(`Delivery to ${p.deliveryState} plus fees is more than you would receive. Adjust the price or who pays.`);
  }
  return q;
}
__name(priceDeal, "priceDeal");
async function previewDeal(ctx, input, seller) {
  const p = pricingInput(ctx, input);
  const promo = await checkSellerPromo(ctx, seller, input.promo_code, input.replaces ? Number(input.replaces) : null);
  return {
    pickup_state: p.pickupState,
    delivery_state: p.deliveryState,
    price: await priceDeal(ctx, p, { promo: Boolean(promo) }),
    promo: promo && { code: promo, saving: platformFee(p.itemPrice, ctx.config.fee) }
  };
}
__name(previewDeal, "previewDeal");
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
  const pickupAddress = requireLength(input.pickup_address, "Pickup address", 10, 300);
  const deliveryAddress = requireLength(input.delivery_address, "Buyer's delivery address", 10, 300);
  const deliveryLandmark = str(input.delivery_landmark).slice(0, 200);
  const fragile = input.fragile === true || input.fragile === "yes" || input.fragile === "on";
  const deliveryDays = Number(input.delivery_days || 2);
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1 || deliveryDays > 7) throw new UserError("Ship-within must be 1 to 7 days.");
  const expiresHours = Number(input.expires_hours || 24);
  if (!EXPIRY_OPTIONS.includes(expiresHours)) throw new UserError("Choose when the link expires.");
  const photos = await parsePhotos(input.photos);
  const old = input.replaces ? await first(ctx.env, "SELECT * FROM deals WHERE id = ? AND seller_id = ?", Number(input.replaces), seller.id) : null;
  const replaced = old && old.status === "open" ? old : null;
  const copyPhotosFrom = !photos.length && replaced?.photo_count ? replaced : null;
  const photoCount = photos.length || copyPhotosFrom?.photo_count || 0;
  if (!photoCount) throw new UserError("Add at least one photo of the item, so the buyer can see what they are paying for.");
  const p = pricingInput(ctx, input);
  const promo = await checkSellerPromo(ctx, seller, input.promo_code, replaced?.id ?? null);
  const q = await priceDeal(ctx, p, { promo: Boolean(promo) });
  if (input.condition_confirmed !== true && input.condition_confirmed !== "yes") {
    throw new UserError("Confirm that the item is in good condition, exactly as agreed with the buyer.");
  }
  const now = ctx.now();
  const token = randomToken(12);
  const statements = [];
  let replacesId = null;
  if (replaced) {
    replacesId = replaced.id;
    statements.push(stmt(ctx.env, "UPDATE deals SET status = 'replaced' WHERE id = ? AND status = 'open'", replaced.id));
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
      item_price: p.itemPrice,
      pickup_address: pickupAddress,
      pickup_zone: p.pickupState,
      // legacy column, kept filled
      pickup_state: p.pickupState,
      weight_kg: p.weightKg,
      fragile,
      delivery_address: deliveryAddress,
      delivery_landmark: deliveryLandmark || null,
      delivery_state: p.deliveryState,
      delivery_zone: p.deliveryState,
      // legacy column, kept filled
      delivery_fee: q.deliveryFee,
      delivery_payer: p.deliveryPayer,
      fee_payer: p.feePayer,
      platform_fee: q.platformFee,
      processing_fee: q.processingFee,
      buyer_total: q.buyerTotal,
      seller_payout: q.sellerPayout,
      delivery_days: deliveryDays,
      inspection_hours: ctx.config.inspectionHours,
      photo_count: photoCount,
      promo_code: promo,
      condition_confirmed_at: iso(now),
      condition_pledge: fillConsent("seller", q.deliveryFee),
      status: "open",
      expires_at: iso(addHours(now, expiresHours)),
      created_at: iso(now)
    }),
    updateStmt(ctx.env, "sellers", seller.id, { pickup_address: pickupAddress, pickup_state: p.pickupState })
  );
  const newDealId = "(SELECT id FROM deals WHERE token = ?)";
  photos.forEach((ph, i) => statements.push(stmt(
    ctx.env,
    `INSERT INTO deal_photos (deal_id, position, mime, data, sha256, bytes, phash, created_at) VALUES (${newDealId}, ?, ?, ?, ?, ?, ?, ?)`,
    token,
    i + 1,
    ph.mime,
    ph.data,
    ph.sha256,
    ph.bytes,
    ph.phash,
    iso(now)
  )));
  if (copyPhotosFrom) {
    statements.push(stmt(
      ctx.env,
      `INSERT INTO deal_photos (deal_id, position, mime, data, sha256, bytes, phash, created_at)
       SELECT ${newDealId}, position, mime, data, sha256, bytes, phash, ? FROM deal_photos WHERE deal_id = ?`,
      token,
      iso(now),
      copyPhotosFrom.id
    ));
  }
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
var photoRows = /* @__PURE__ */ __name((ctx, deal) => all(ctx.env, "SELECT position, sha256 FROM deal_photos WHERE deal_id = ? ORDER BY position", deal.id), "photoRows");
var dealPhotos = /* @__PURE__ */ __name(async (ctx, deal) => photoUrls(ctx, deal, await photoRows(ctx, deal)), "dealPhotos");
var dealPhotoHashes = /* @__PURE__ */ __name(async (ctx, deal) => (await photoRows(ctx, deal)).map((p) => p.sha256), "dealPhotoHashes");
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
    photos: await dealPhotos(ctx, deal),
    ships_from: deal.pickup_state,
    delivery: { address: deal.delivery_address, landmark: deal.delivery_landmark, state: deal.delivery_state },
    delivery_payer: deal.delivery_payer,
    delivery_days: deal.delivery_days,
    inspection_hours: deal.inspection_hours,
    expires_at: deal.expires_at,
    fee_payer: deal.fee_payer,
    promo_applied: Boolean(deal.promo_code),
    price: {
      item: q.itemPrice,
      delivery: q.buyerDelivery,
      delivery_full: q.deliveryFee,
      platform_fee: q.buyerPlatformShare,
      platform_fee_full: q.platformFee,
      processing_fee: q.buyerProcessingShare,
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

// src/lib/evidence.js
var STAMP_MINUTES = 30;
var OLD_PHOTO_MINUTES = 60;
var SAME_PICTURE_DISTANCE = 8;
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var lagosTime = /* @__PURE__ */ __name((d) => d.toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }), "lagosTime");
async function issueStamp(ctx, order) {
  const code = Array.from(randomToken(8)).map((c) => CODE_ALPHABET[c.charCodeAt(0) % CODE_ALPHABET.length]).join("").slice(0, 4);
  const now = ctx.now();
  const token = await signLink(ctx.config.appSecret, `stamp-${order.id}-${code}-${Math.floor(now.getTime() / 1e3)}`, new Date(now.getTime() + STAMP_MINUTES * 6e4));
  return { code, token, text: `TrustGap \xB7 ${order.ref} \xB7 ${lagosTime(now)} \xB7 ${code}`, valid_minutes: STAMP_MINUTES };
}
__name(issueStamp, "issueStamp");
var hamming = /* @__PURE__ */ __name((a, b) => {
  let n = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}, "hamming");
async function checkEvidence(ctx, order, photos, { listing = [], earlier = [] } = {}) {
  const now = ctx.now();
  return Promise.all(photos.map(async (p) => {
    const flags = [];
    let stampCode = null;
    let capturedAt = null;
    if (p.source === "camera") {
      const data = p.stampToken && await verifyLink(ctx.config.appSecret, p.stampToken, now);
      const m = data && /^stamp-(\d+)-([A-Z0-9]{4})-(\d+)$/.exec(data);
      if (!m) flags.push("stamp_invalid");
      else if (Number(m[1]) !== order.id) flags.push("stamp_other_order");
      else {
        stampCode = m[2];
        capturedAt = new Date(Number(m[3]) * 1e3).toISOString();
      }
    } else {
      flags.push("not_camera");
      if (!p.takenAt || !p.cameraInfo) flags.push("no_camera_info");
      else if (now.getTime() - new Date(p.takenAt).getTime() > OLD_PHOTO_MINUTES * 6e4) flags.push(`taken:${p.takenAt}`);
    }
    if (p.phash) {
      for (const l of listing) if (l.phash && hamming(p.phash, l.phash) <= SAME_PICTURE_DISTANCE) flags.push(`matches_listing:${l.position}`);
      if (earlier.some((e) => e.phash && hamming(p.phash, e.phash) <= SAME_PICTURE_DISTANCE)) flags.push("matches_earlier_evidence");
    }
    if (photos.filter((q) => q.sha256 === p.sha256).length > 1) flags.push("duplicate_in_report");
    return { ...p, stamp_code: stampCode, captured_at: capturedAt, flags };
  }));
}
__name(checkEvidence, "checkEvidence");
function describeFlags(flags, { lagos = lagosTime } = {}) {
  return (flags || []).map((f) => {
    if (f === "not_camera") return "Chosen from the phone, not taken with the TrustGap camera";
    if (f === "no_camera_info") return "No camera details: could be a screenshot, a forwarded or edited picture";
    if (f.startsWith("taken:")) return `The phone says it was taken ${lagos(new Date(f.slice(6)))}, well before the report`;
    if (f === "stamp_invalid") return "Camera stamp doesn\u2019t check out (expired or altered)";
    if (f === "stamp_other_order") return "Camera stamp is from a different order";
    if (f.startsWith("matches_listing:")) return `Looks like the seller\u2019s listing photo ${f.split(":")[1]}`;
    if (f === "matches_earlier_evidence") return "Looks like a photo already sent in this case";
    if (f === "duplicate_in_report") return "The same picture was sent twice";
    return f;
  });
}
__name(describeFlags, "describeFlags");

// src/core/returns.js
var RETURN_LABELS = {
  with_rider: "Rider is taking it back to the seller",
  booked: "Return booked: a rider will collect it from the buyer",
  picked_up: "Collected from the buyer",
  out_for_delivery: "On the way back to the seller",
  attempt_failed: "Collection attempt failed",
  received: "Seller has the item back",
  cancelled: "Return cancelled"
};
var OPEN = ["with_rider", "booked", "picked_up", "out_for_delivery", "attempt_failed"];
var RETURN_STEPS = {
  picked_up: ["booked", "attempt_failed"],
  out_for_delivery: ["booked", "picked_up", "attempt_failed"],
  attempt_failed: ["booked", "picked_up", "out_for_delivery"]
};
var activeReturn = /* @__PURE__ */ __name((ctx, orderId) => first(ctx.env, "SELECT * FROM returns WHERE order_id = ? AND status != 'cancelled' ORDER BY id DESC", orderId), "activeReturn");
var isOpenReturn = /* @__PURE__ */ __name((ret) => Boolean(ret && OPEN.includes(ret.status)), "isOpenReturn");
var revealReturnPin = /* @__PURE__ */ __name((ctx, ret) => decrypt(ret.pin_enc, ctx.config.appSecret), "revealReturnPin");
async function returnView(ctx, ret, { withPin = false } = {}) {
  if (!ret) return null;
  return {
    id: ret.id,
    kind: ret.kind,
    status: ret.status,
    label: ret.problem_at ? "Seller has it back but reported it isn\u2019t what was delivered" : RETURN_LABELS[ret.status] || ret.status,
    problem: Boolean(ret.problem_at),
    problem_note: ret.problem_note || null,
    open: isOpenReturn(ret),
    deadline_at: ret.deadline_at,
    received_at: ret.received_at,
    received_by: ret.received_by,
    // After a problem report the seller still needs the PIN: a Fez rider can only close the job with it.
    ...withPin && (isOpenReturn(ret) || ret.problem_at) ? { pin: await revealReturnPin(ctx, ret) } : {}
  };
}
__name(returnView, "returnView");
async function newPin(ctx) {
  const pin = randomDigits(4);
  return { pin, enc: await encrypt(pin, ctx.config.appSecret) };
}
__name(newPin, "newPin");
var pinSms = /* @__PURE__ */ __name((order, pin) => `Your TrustGap return PIN for order ${order.ref} is ${pin}. Check the returned item first, then give the rider this PIN. If it isn't your item, don't accept it and contact TrustGap.`, "pinSms");
async function startDoorReturn(ctx, order, { received = false, by = "courier" } = {}) {
  if (await activeReturn(ctx, order.id)) return null;
  const { pin, enc: enc2 } = await newPin(ctx);
  const now = iso(ctx.now());
  await insert(ctx.env, "returns", {
    order_id: order.id,
    kind: "door",
    status: received ? "received" : "with_rider",
    pin_enc: enc2,
    courier: order.courier,
    delivery_ref: order.delivery_ref,
    received_at: received ? now : null,
    received_by: received ? by : null,
    created_at: now
  });
  await logEvent(ctx, order.id, by, received ? "return_received" : "return_started", received ? "returned by the courier" : "refused at the door");
  if (received) {
    await update(ctx.env, "orders", order.id, { delivery_status: "returned" });
  } else {
    const seller = await getSeller(ctx, order.seller_id);
    await ctx.notify.send({ orderId: order.id, event: "return_pin", phone: seller.phone, email: seller.email, sms: `TrustGap: the buyer refused order ${order.ref} at the door and the rider is bringing it back. ${pinSms(order, pin)}` });
  }
  return activeReturn(ctx, order.id);
}
__name(startDoorReturn, "startDoorReturn");
async function bookPickupReturn(ctx, order) {
  if (await activeReturn(ctx, order.id)) throw new UserError("A return already exists for this order.");
  if (!order.delivered_at) throw new UserError("The item never reached the buyer, so there is nothing to collect.");
  const deal = await getDeal(ctx, order.deal_id);
  const seller = await getSeller(ctx, order.seller_id);
  const { pin, enc: enc2 } = await newPin(ctx);
  const deadline = addHours(ctx.now(), ctx.config.returnPickupDays * 24);
  const id = await insert(ctx.env, "returns", {
    order_id: order.id,
    kind: "pickup",
    status: "booking",
    pin_enc: enc2,
    courier: ctx.logistics.name,
    deadline_at: iso(deadline),
    created_at: iso(ctx.now())
  });
  let booking;
  try {
    const riderToken = await signLink(ctx.config.appSecret, `return-${id}`, addHours(ctx.now(), ctx.config.riderLinkDays * 24));
    booking = await ctx.logistics.bookReturn({ order, deal, seller, pin, ref: `${order.ref}-R`, riderToken });
  } catch (err) {
    await run(ctx.env, "DELETE FROM returns WHERE id = ?", id);
    throw new UserError(`Could not book the return with the courier: ${err.message}`);
  }
  let cost = null;
  try {
    cost = (await ctx.logistics.quote({ pickupState: order.delivery_state, dropoffState: deal.pickup_state, weightKg: deal.weight_kg })).feeKobo;
  } catch {
  }
  await update(ctx.env, "returns", id, { status: "booked", delivery_ref: booking.deliveryRef, rider_url: booking.riderUrl || null, cost });
  if (cost) {
    await insert(ctx.env, "ledger", { order_id: order.id, kind: "return_cost", amount: cost, counterparty: ctx.logistics.name, status: "pending", created_at: iso(ctx.now()) });
  }
  await logEvent(ctx, order.id, "admin", "return_booked", { delivery_ref: booking.deliveryRef });
  await ctx.notify.send({
    orderId: order.id,
    event: "return_booked",
    phone: order.buyer_phone,
    email: order.buyer_email,
    sms: `TrustGap: a rider will collect "${deal.item_title}" from you to return it to the seller (order ${order.ref}). Please have it packed with everything that came with it by ${fmtDate(deadline)}. Your refund is sent once the seller receives it: ${trackUrl(ctx, order)}`
  });
  await ctx.notify.send({ orderId: order.id, event: "return_pin", phone: seller.phone, email: seller.email, sms: `TrustGap: the item from order ${order.ref} is being returned to you. ${pinSms(order, pin)}` });
  return first(ctx.env, "SELECT * FROM returns WHERE id = ?", id);
}
__name(bookPickupReturn, "bookPickupReturn");
async function receiveReturn(ctx, ret, by) {
  const res = await run(
    ctx.env,
    `UPDATE returns SET status = 'received', received_at = ?, received_by = ? WHERE id = ? AND status IN (${OPEN.map(() => "?").join(", ")})`,
    iso(ctx.now()),
    by,
    ret.id,
    ...OPEN
  );
  if (res.meta.changes !== 1) return false;
  await run(ctx.env, "UPDATE ledger SET status = 'success' WHERE order_id = ? AND kind = 'return_cost'", ret.order_id);
  if (ret.kind === "door") await update(ctx.env, "orders", ret.order_id, { delivery_status: "returned" });
  await logEvent(ctx, ret.order_id, by, "return_received");
  const order = await getOrder(ctx, ret.order_id);
  if (!await settleAfterReturn(ctx, order)) {
    await ctx.notify.send({ orderId: order.id, event: "return_received", phone: order.buyer_phone, sms: `TrustGap: the seller has received the returned item for order ${order.ref}. We'll send our decision shortly.` });
  }
  return true;
}
__name(receiveReturn, "receiveReturn");
async function verifyReturnPin(ctx, ret, pin, actor) {
  if (!isOpenReturn(ret)) throw new UserError("This return is already closed.");
  if (ret.pin_attempts >= ctx.config.pinMaxAttempts) throw new UserError("Too many wrong PINs. Contact TrustGap support to continue.");
  if (!safeEqual(str(pin), await revealReturnPin(ctx, ret))) {
    await run(ctx.env, "UPDATE returns SET pin_attempts = pin_attempts + 1 WHERE id = ?", ret.id);
    await logEvent(ctx, ret.order_id, actor, "wrong_return_pin");
    throw new UserError(`Wrong PIN. ${ctx.config.pinMaxAttempts - ret.pin_attempts - 1} attempt(s) left.`);
  }
  if (!await receiveReturn(ctx, ret, actor)) throw new UserError("This return was already updated.");
}
__name(verifyReturnPin, "verifyReturnPin");
async function applyReturnUpdate(ctx, ret, { status, note, actor }) {
  const from = RETURN_STEPS[status];
  if (!from) throw new UserError("Unknown return update.");
  const reason = str(note).slice(0, 500);
  if (status === "attempt_failed" && reason.length < 3) throw new UserError("Say what happened.");
  const res = await run(ctx.env, `UPDATE returns SET status = ? WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`, status, ret.id, ...from);
  if (res.meta.changes !== 1) throw new UserError(`Cannot mark "${RETURN_LABELS[status]}" while the return is "${RETURN_LABELS[ret.status] || ret.status}".`);
  await logEvent(ctx, ret.order_id, actor, "return_" + status, reason || null);
  if (status === "attempt_failed") {
    const order = await getOrder(ctx, ret.order_id);
    await ctx.notify.send({ orderId: order.id, event: "return_attempt_failed", phone: order.buyer_phone, sms: `TrustGap: the rider could not collect the return for order ${order.ref} (${reason}). Your refund waits until the item is back with the seller.` });
  }
}
__name(applyReturnUpdate, "applyReturnUpdate");
var STAGE_TO_STATUS = { picked_up: "picked_up", out_for_delivery: "out_for_delivery" };
async function syncReturnStatus(ctx, ret) {
  if (!isOpenReturn(ret) || ret.kind !== "pickup" || !ret.delivery_ref || ret.courier !== ctx.logistics.name) return null;
  const st = await ctx.logistics.getStatus(ret.delivery_ref);
  if (!st) return null;
  if (st.raw && st.raw !== ret.courier_status) {
    await update(ctx.env, "returns", ret.id, { courier_status: st.raw });
    await logEvent(ctx, ret.order_id, "courier", "return_courier_status", st.reason ? `${st.raw}: ${st.reason}` : st.raw);
  }
  if (st.stage === "delivered") await receiveReturn(ctx, ret, "courier");
  else if (STAGE_TO_STATUS[st.stage] && st.stage !== ret.status) await update(ctx.env, "returns", ret.id, { status: STAGE_TO_STATUS[st.stage] });
  return st;
}
__name(syncReturnStatus, "syncReturnStatus");
async function cancelReturn(ctx, ret, note) {
  if (!isOpenReturn(ret)) throw new UserError("Only an open return can be cancelled.");
  const reason = str(note);
  if (reason.length < 5) throw new UserError("Say why the return is cancelled.");
  await run(ctx.env, "UPDATE returns SET status = 'cancelled' WHERE id = ?", ret.id);
  await run(ctx.env, "UPDATE ledger SET status = 'cancelled' WHERE order_id = ? AND kind = 'return_cost' AND status = 'pending'", ret.order_id);
  await run(ctx.env, "UPDATE disputes SET status = 'open' WHERE order_id = ? AND status = 'awaiting_return'", ret.order_id);
  await logEvent(ctx, ret.order_id, "admin", "return_cancelled", reason);
  if (ret.kind === "pickup" && ret.delivery_ref && ctx.logistics.cancel) {
    try {
      await ctx.logistics.cancel(ret.delivery_ref, reason);
    } catch (err) {
      console.error("courier cancel failed", ret.delivery_ref, err.message);
    }
  }
}
__name(cancelReturn, "cancelReturn");
var MAX_RETURN_PROBLEM_PHOTOS = 3;
async function reportReturnProblem(ctx, ret, input) {
  if (!isOpenReturn(ret)) throw new UserError("This return is already closed. Contact TrustGap support.");
  const description = str(input.description).slice(0, 2e3);
  if (description.length < 10) throw new UserError("Describe what is wrong with the item that came back.");
  const order = await getOrder(ctx, ret.order_id);
  const photos = await checkedEvidence(ctx, order, await parsePhotos(input.photos, MAX_RETURN_PROBLEM_PHOTOS));
  if (!photos.length) throw new UserError("Add at least one photo showing what came back.");
  const now = iso(ctx.now());
  const before = await first(ctx.env, "SELECT * FROM disputes WHERE order_id = ? AND status IN ('open', 'awaiting_return') ORDER BY id DESC", order.id);
  const context = before?.status === "awaiting_return" ? ` (Earlier decision, now set aside: refund ${(before.buyer_refund / 100).toLocaleString("en-NG")} naira.)` : "";
  const won = await transition(ctx, order.id, ["disputed"], { status: "disputed" }, (h) => [
    h.sql(
      `UPDATE returns SET status = 'received', received_at = ?, received_by = 'seller', problem_at = ?, problem_note = ? WHERE id = ? AND status IN (${OPEN.map(() => "?").join(", ")})`,
      now,
      now,
      description,
      ret.id,
      ...OPEN
    ),
    h.sql("UPDATE disputes SET status = 'superseded' WHERE order_id = ? AND status IN ('open', 'awaiting_return')", order.id),
    h.insert("disputes", { order_id: order.id, opened_by: "seller", category: "returned_item_problem", description: description + context, status: "open", created_at: now }),
    ...photos.map((p, i) => evidencePhotoStmt(h, ctx, order.id, i + 1, p)),
    h.sql("UPDATE ledger SET status = 'success' WHERE order_id = ? AND kind = 'return_cost'", order.id),
    ...ret.kind === "door" ? [h.sql("UPDATE orders SET delivery_status = 'returned' WHERE id = ?", order.id)] : [],
    h.event("seller", "return_received_with_problem", { description, photos: photos.length })
  ]);
  if (!won) throw new UserError("This order changed while you were reporting. Refresh and try again.", 409);
  const seller = await getSeller(ctx, order.seller_id);
  await ctx.notify.send({
    orderId: order.id,
    event: "return_problem",
    phone: order.buyer_phone,
    email: order.buyer_email,
    sms: `TrustGap: the seller says the item returned for order ${order.ref} isn't what was delivered. Any refund is on hold while TrustGap reviews. Send any photos or video you have of the item before you handed it over: ${trackUrl(ctx, order)}`
  });
  await ctx.notify.send({
    orderId: order.id,
    event: "return_problem",
    phone: seller.phone,
    sms: `TrustGap: we've recorded the item for order ${order.ref} as back with you, with your report. You can now give the rider your return PIN so they can leave. TrustGap will review and decide.`
  });
}
__name(reportReturnProblem, "reportReturnProblem");

// src/core/orders.js
async function startCheckout(ctx, deal, promoInput, { acknowledged = false, termsAccepted = false } = {}) {
  deal = await refreshDeal(ctx, deal);
  if (deal.status !== "open") throw new UserError("This link is no longer available.", 410);
  const promo = await buyerPromo(ctx, deal, promoInput);
  const ackAt = acknowledged ? iso(ctx.now()) : null;
  const tosAt = termsAccepted ? iso(ctx.now()) : null;
  const { json: json2, hash } = await snapshotTerms(deal, await getSeller(ctx, deal.seller_id), await dealPhotoHashes(ctx, deal), promo, ackAt, tosAt);
  const id = randomToken(15);
  await insert(ctx.env, "checkouts", { id, deal_id: deal.id, terms_json: json2, terms_hash: hash, created_at: iso(ctx.now()) });
  return { checkout_id: id, terms_hash: hash, total: JSON.parse(json2).money.buyer_total, promo };
}
__name(startCheckout, "startCheckout");
async function buyerPromo(ctx, deal, input) {
  const code = await checkPromo(ctx, input);
  if (!code) return null;
  if (deal.promo_code) throw new UserError("This link already has no TrustGap fee. Keep your code for another deal.");
  const discount = buyerPart(deal.fee_payer, deal.platform_fee);
  if (!discount) throw new UserError("The seller pays the TrustGap fee on this deal, so your code has nothing to remove. Keep it for another deal.");
  return { code, discount };
}
__name(buyerPromo, "buyerPromo");
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
  const bankCode = str(input.refund_bank_code);
  const accountNumber = str(input.refund_account_number);
  if (!/^\d{10}$/.test(accountNumber)) throw new UserError("Refund account number must be 10 digits.");
  const bank = (await ctx.payments.listBanks()).find((b) => b.code === bankCode);
  if (!bank) throw new UserError("Choose the bank for refunds.");
  let accountName;
  try {
    ({ accountName } = await ctx.payments.resolveAccount({ bankCode, accountNumber }));
  } catch (err) {
    throw new UserError(err.locked ? err.message : `Refund account: ${err.message}`, err.locked ? 503 : 400);
  }
  if (!namesMatch(buyerName, accountName)) {
    throw new UserError(
      `The refund account belongs to "${accountName}". Refunds can only go to an account in your own name. Use your own account, or enter your name exactly as your bank has it.`
    );
  }
  const terms = JSON.parse(checkout.terms_json);
  if (!terms.buyer_acknowledgement) {
    throw new UserError("Go back to step 1 and confirm you\u2019ve read what happens if you change your mind.", 409);
  }
  if (!terms.terms_of_service) {
    throw new UserError("Go back to step 1 and tick the box to accept the TrustGap Terms of Service.", 409);
  }
  const money = terms.money;
  const discount = money.promo_discount || 0;
  const total = deal.buyer_total - discount;
  if (input.expected_total !== void 0 && Number(input.expected_total) !== total) {
    throw new UserError(`This deal now costs ${formatNaira(total)}. Please go back to step 1 and check it again.`, 409);
  }
  const promoCode = discount ? await checkPromo(ctx, money.promo_code) : deal.promo_code || null;
  if (discount && await buyerUsedPromo(ctx, buyerPhone, promoCode)) {
    throw new UserError("This phone number has already used the early-access code. Go back to step 1 and remove it to continue.", 409);
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
    delivery_address: deal.delivery_address,
    delivery_landmark: deal.delivery_landmark,
    delivery_state: deal.delivery_state,
    delivery_fee: deal.delivery_fee,
    platform_fee: deal.platform_fee - discount,
    processing_fee: deal.processing_fee,
    seller_payout: deal.seller_payout,
    promo_code: promoCode,
    promo_discount: discount,
    buyer_ack_at: terms.buyer_acknowledgement.at,
    buyer_terms_accepted_at: terms.terms_of_service.at,
    buyer_marketing_opt_in_at: input.marketing_opt_in === true || input.marketing_opt_in === "yes" ? iso(ctx.now()) : null,
    refund_bank_code: bankCode,
    refund_bank_name: bank.name,
    refund_account_enc: await encrypt(accountNumber, ctx.config.appSecret),
    refund_account_last4: accountNumber.slice(-4),
    refund_account_name: accountName,
    terms_json: checkout.terms_json,
    terms_hash: checkout.terms_hash,
    terms_accepted_at: checkout.created_at,
    amount: total,
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
    emailSubject: `Payment secured: order ${order.ref}`
  });
  await ctx.notify.send({
    orderId: order.id,
    event: "payment_received_buyer",
    phone: order.buyer_phone,
    email: order.buyer_email,
    sms: `TrustGap: payment received for "${deal.item_title}" (order ${order.ref}). Your money is held until delivery. Your delivery PIN is ${pin}. Give it to the rider ONLY after checking the item. Track: ${trackUrl(ctx, order)}`,
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
    booking = await ctx.logistics.book({ order: { ...order, packing_note: note }, deal, seller, pin: await revealPin(ctx, order) });
  } catch (err) {
    await update(ctx.env, "orders", order.id, { status: "paid", delivery_status: "not_booked", dispatched_at: null });
    throw new UserError(`Could not book the courier: ${err.message}`);
  }
  await ctx.env.DB.batch([
    stmt(
      ctx.env,
      "UPDATE orders SET delivery_status = 'booked', delivery_ref = ?, rider_url = ?, courier = ? WHERE id = ?",
      booking.deliveryRef,
      booking.riderUrl || null,
      ctx.logistics.name,
      order.id
    ),
    stmt(
      ctx.env,
      "INSERT INTO ledger (order_id, kind, amount, counterparty, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      order.id,
      "delivery_cost",
      order.delivery_fee,
      ctx.logistics.name,
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
  if (status === "returned") throw new UserError("Enter the seller\u2019s return PIN to confirm you handed the item back.");
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
    await startDoorReturn(ctx, await getOrder(ctx, order.id), { by: actor });
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
  if (!await markDelivered(ctx, order, actor, "delivered_with_pin")) throw new UserError("This order was already updated.");
}
__name(verifyDeliveryPin, "verifyDeliveryPin");
async function markDelivered(ctx, order, actor, eventType) {
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
      h.event(actor, eventType)
    ]
  );
  if (!won) return false;
  const seller = await getSeller(ctx, order.seller_id);
  await ctx.notify.send({
    orderId: order.id,
    event: "delivered_buyer",
    phone: order.buyer_phone,
    sms: `TrustGap: order ${order.ref} delivered. If something is wrong, report it before ${fmtDate(ends)}: ${trackUrl(ctx, order)}. Otherwise the seller is paid automatically.`
  });
  await ctx.notify.send({
    orderId: order.id,
    event: "delivered_seller",
    phone: seller.phone,
    sms: `TrustGap: order ${order.ref} was delivered. Your payout is released when the buyer confirms or at ${fmtDate(ends)}, unless they report a problem.`
  });
  return true;
}
__name(markDelivered, "markDelivered");
var STAGE_RANK = { booked: 1, picked_up: 2, out_for_delivery: 3 };
async function syncCourierStatus(ctx, order) {
  if (!order.delivery_ref || order.courier !== ctx.logistics.name) return null;
  const st = await ctx.logistics.getStatus(order.delivery_ref);
  if (!st) return null;
  if (st.raw && st.raw !== order.courier_status) {
    await update(ctx.env, "orders", order.id, { courier_status: st.raw });
    await logEvent(ctx, order.id, "courier", "courier_status", st.reason ? `${st.raw}: ${st.reason}` : st.raw);
  }
  if (st.stage === "delivered") {
    if (order.status === "shipping") await markDelivered(ctx, order, "courier", "delivered_by_courier");
  } else if (STAGE_RANK[st.stage] && (STAGE_RANK[order.delivery_status] || 0) < STAGE_RANK[st.stage]) {
    await run(ctx.env, "UPDATE orders SET delivery_status = ? WHERE id = ? AND status = 'shipping'", st.stage, order.id);
    if (st.stage === "out_for_delivery") {
      await ctx.notify.send({
        orderId: order.id,
        event: "delivery_out_for_delivery",
        phone: order.buyer_phone,
        sms: `TrustGap: order ${order.ref} is out for delivery. Check the item before you give the rider your PIN.`
      });
    }
  } else if (st.stage === "returned" && order.delivery_status !== "returned") {
    await update(ctx.env, "orders", order.id, { delivery_status: "returned" });
    if (order.status === "shipping") {
      await openDispute(ctx, await getOrder(ctx, order.id), {
        by: "courier",
        category: "returned_by_courier",
        description: `The courier returned the parcel${st.reason ? `: ${st.reason}` : ""}.`
      });
    }
    const ret = await activeReturn(ctx, order.id);
    if (!ret) await startDoorReturn(ctx, await getOrder(ctx, order.id), { received: true });
    else if (ret.kind === "door") await receiveReturn(ctx, ret, "courier");
  }
  return st;
}
__name(syncCourierStatus, "syncCourierStatus");
var PHOTO_REQUIRED = ["wrong_item", "damaged", "not_as_described", "counterfeit"];
var MAX_DISPUTE_PHOTOS = 2;
async function openDispute(ctx, order, { by, category, description, photos: photoInput }) {
  if (!DISPUTE_CATEGORIES[category]) throw new UserError("Choose what went wrong.");
  const text = str(description).slice(0, 2e3);
  if (text.length < 3) throw new UserError("Describe the problem.");
  const photos = await checkedEvidence(ctx, order, await parsePhotos(photoInput, MAX_DISPUTE_PHOTOS));
  if (by === "buyer" && PHOTO_REQUIRED.includes(category) && !photos.length) {
    throw new UserError("Add at least one photo showing the problem with the item.");
  }
  if (!["paid", "shipping", "delivered"].includes(order.status)) throw new UserError("A problem can no longer be reported on this order.");
  if (by === "buyer" && order.status === "delivered" && new Date(order.inspection_ends_at) <= ctx.now()) {
    throw new UserError("The inspection period has ended.");
  }
  const won = await transition(ctx, order.id, [order.status], { status: "disputed" }, (h) => [
    h.insert("disputes", { order_id: order.id, opened_by: by, category, description: text, status: "open", created_at: iso(ctx.now()) }),
    // Saved in the same step as the dispute, so a report never exists without its photos.
    ...photos.map((p, i) => evidencePhotoStmt(h, ctx, order.id, i + 1, p)),
    h.event(by, "dispute_opened", { category, description: text, photos: photos.length })
  ]);
  if (!won) throw new UserError("This order changed while you were reporting. Refresh and try again.", 409);
  const seller = await getSeller(ctx, order.seller_id);
  const sms = `TrustGap: a problem was reported on order ${order.ref} (${DISPUTE_CATEGORIES[category]}). The money stays held while we review. We may contact you for evidence.`;
  await ctx.notify.send({ orderId: order.id, event: "dispute_opened", phone: order.buyer_phone, sms });
  await ctx.notify.send({ orderId: order.id, event: "dispute_opened", phone: seller.phone, sms });
}
__name(openDispute, "openDispute");
async function checkedEvidence(ctx, order, photos) {
  if (!photos.length) return photos;
  const listing = await all(ctx.env, "SELECT position, phash FROM deal_photos WHERE deal_id = ? AND phash IS NOT NULL", order.deal_id);
  const earlier = await all(ctx.env, "SELECT p.phash FROM dispute_photos p JOIN disputes d ON d.id = p.dispute_id WHERE d.order_id = ? AND p.phash IS NOT NULL", order.id);
  return checkEvidence(ctx, order, photos, { listing, earlier });
}
__name(checkedEvidence, "checkedEvidence");
function evidencePhotoStmt(h, ctx, orderId, position, p) {
  return h.sql(
    `INSERT INTO dispute_photos (dispute_id, position, mime, data, sha256, bytes, source, stamp_code, captured_at, phash, flags, created_at)
     SELECT (SELECT MAX(id) FROM disputes WHERE order_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE 1`,
    orderId,
    position,
    p.mime,
    p.data,
    p.sha256,
    p.bytes,
    p.source,
    p.stamp_code,
    p.captured_at,
    p.phash,
    JSON.stringify(p.flags || []),
    iso(ctx.now())
  );
}
__name(evidencePhotoStmt, "evidencePhotoStmt");
async function evidenceDetails(ctx, disputeId) {
  const rows = await all(ctx.env, "SELECT id, source, stamp_code, captured_at, flags FROM dispute_photos WHERE dispute_id = ? ORDER BY position", disputeId);
  const until = addHours(ctx.now(), EVIDENCE_LINK_HOURS);
  return Promise.all(rows.map(async (r) => ({
    url: `${ctx.config.apiUrl}/api/evidence/${await signLink(ctx.config.appSecret, `dp${r.id}`, until)}`,
    source: r.source || "upload",
    stamp_code: r.stamp_code,
    captured_at: r.captured_at,
    warnings: describeFlags(JSON.parse(r.flags || "[]"))
  })));
}
__name(evidenceDetails, "evidenceDetails");
async function evidenceUrls(ctx, disputeId) {
  const rows = await all(ctx.env, "SELECT id FROM dispute_photos WHERE dispute_id = ? ORDER BY position", disputeId);
  const until = addHours(ctx.now(), EVIDENCE_LINK_HOURS);
  return Promise.all(rows.map(async (r) => `${ctx.config.apiUrl}/api/evidence/${await signLink(ctx.config.appSecret, `dp${r.id}`, until)}`));
}
__name(evidenceUrls, "evidenceUrls");
async function resolveDispute(ctx, disputeId, input, { by = "admin" } = {}) {
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
  const decision = { buyerRefund, sellerPayout, sellerCharge, note, by };
  let ret = await activeReturn(ctx, order.id);
  if (sellerPayout > 0 && (ret && !ret.problem_at || buyerRefund > 0 && order.delivered_at && !ret)) {
    throw new UserError(ret ? "The item is back with the seller (or on its way), so the seller can\u2019t also be paid. Refund the buyer, with or without the delivery deductions." : "A refund means the item goes back to the seller, so the seller can\u2019t also be paid. Choose a refund or a payout, not both.");
  }
  if (buyerRefund > 0 && order.delivered_at && !ret) ret = await bookPickupReturn(ctx, order);
  if (isOpenReturn(ret) && buyerRefund > 0) {
    const res = await run(
      ctx.env,
      "UPDATE disputes SET status = 'awaiting_return', resolution_note = ?, buyer_refund = ?, seller_payout = ?, seller_charge = ?, decided_by = ? WHERE id = ? AND status = 'open'",
      note,
      buyerRefund,
      sellerPayout,
      sellerCharge,
      by,
      dispute.id
    );
    if (res.meta.changes !== 1) throw new UserError("This dispute was already decided.");
    await logEvent(ctx, order.id, by, "dispute_decided_after_return", { buyerRefund, sellerPayout, sellerCharge, note });
    const seller = await getSeller(ctx, order.seller_id);
    const sms = `TrustGap decision on ${order.ref}. ${decisionSummary(decision)} The refund is sent once the seller has the item back.`;
    await ctx.notify.send({ orderId: order.id, event: "dispute_decided", phone: order.buyer_phone, email: order.buyer_email, sms });
    await ctx.notify.send({ orderId: order.id, event: "dispute_decided", phone: seller.phone, email: seller.email, sms });
    return { waiting_for_return: true };
  }
  await settleDispute(ctx, order, dispute, decision);
  return { waiting_for_return: false };
}
__name(resolveDispute, "resolveDispute");
async function settleAfterReturn(ctx, order) {
  const dispute = await first(ctx.env, "SELECT * FROM disputes WHERE order_id = ? AND status = 'awaiting_return' ORDER BY id DESC", order.id);
  if (!dispute) return false;
  await settleDispute(ctx, order, dispute, {
    buyerRefund: dispute.buyer_refund,
    sellerPayout: dispute.seller_payout,
    sellerCharge: dispute.seller_charge,
    note: dispute.resolution_note,
    by: dispute.decided_by || "admin"
  });
  return true;
}
__name(settleAfterReturn, "settleAfterReturn");
var decisionSummary = /* @__PURE__ */ __name(({ buyerRefund, sellerPayout, sellerCharge, note }) => `Refund to buyer: ${formatNaira(buyerRefund)}. Paid to seller: ${formatNaira(sellerPayout)}.${sellerCharge > 0 ? ` Charged to seller: ${formatNaira(sellerCharge)}.` : ""} Reason: ${note}`, "decisionSummary");
async function settleDispute(ctx, order, dispute, { buyerRefund, sellerPayout, sellerCharge, note, by = "admin" }) {
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
        "UPDATE disputes SET status = 'resolved', resolution_note = ?, buyer_refund = ?, seller_payout = ?, seller_charge = ?, resolved_at = ?, decided_by = ? WHERE id = ? AND status IN ('open', 'awaiting_return')",
        note,
        buyerRefund,
        sellerPayout,
        sellerCharge,
        now,
        by,
        dispute.id
      ),
      h.sql("UPDATE sellers SET amount_owed = amount_owed + ? WHERE id = ?", sellerCharge, order.seller_id),
      h.sql("UPDATE ledger SET status = 'success' WHERE order_id = ? AND kind = 'delivery_cost'", order.id),
      ...buyerRefund > 0 ? [h.insert("ledger", ledgerRow(ctx, order.id, "buyer_refund", buyerRefund, "buyer", "pending", settles))] : [],
      ...sellerPayout > 0 ? [h.insert("ledger", ledgerRow(ctx, order.id, "seller_payout", sellerPayout, "seller", "pending", settles))] : [],
      ...retained > 0 ? [h.insert("ledger", ledgerRow(ctx, order.id, "platform_retained", retained, "trustgap", "success"))] : [],
      h.event(by, "dispute_resolved", { buyerRefund, sellerPayout, sellerCharge, note })
    ]
  );
  if (!won) throw new UserError("This order was already decided.");
  await sendPendingTransfers(ctx, order.id);
  const seller = await getSeller(ctx, order.seller_id);
  const summary = decisionSummary({ buyerRefund, sellerPayout, sellerCharge, note });
  await ctx.notify.send({ orderId: order.id, event: "dispute_resolved", phone: order.buyer_phone, email: order.buyer_email, sms: `TrustGap decision on ${order.ref}. ${summary}` });
  await ctx.notify.send({ orderId: order.id, event: "dispute_resolved", phone: seller.phone, email: seller.email, sms: `TrustGap decision on ${order.ref}. ${summary}` });
}
__name(settleDispute, "settleDispute");
async function releaseToSeller(ctx, order, reason) {
  if (order.status !== "delivered") throw new UserError("Payment can only be released after delivery.");
  const seller = await getSeller(ctx, order.seller_id);
  const recovered = Math.min(seller.amount_owed, order.seller_payout);
  const payout = order.seller_payout - recovered;
  const settles = settlesAt(ctx, order.paid_at);
  const won = await transition(ctx, order.id, ["delivered"], { status: "completed", closed_at: iso(ctx.now()) }, (h) => [
    ...recovered > 0 ? [
      h.sql("UPDATE sellers SET amount_owed = amount_owed - ? WHERE id = ?", recovered, seller.id),
      h.insert("ledger", ledgerRow(ctx, order.id, "debt_recovered", recovered, "seller", "success"))
    ] : [],
    h.insert("ledger", ledgerRow(ctx, order.id, "platform_fee", order.platform_fee, "trustgap", "success")),
    h.insert("ledger", ledgerRow(ctx, order.id, "processing_fee", order.processing_fee, "flutterwave", "success")),
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
  r.get("/api/health", async ({ ctx }) => {
    const expected = ["sellers", "sessions", "otps", "deals", "checkouts", "orders", "order_events", "disputes", "ledger", "outbox", "mock_transactions", "meta", "deal_photos", "dispute_photos"];
    if (!ctx.env.DB) return { ok: false, database: "No D1 binding called DB. Add it under Settings \u2192 Bindings." };
    try {
      await ensureSchema(ctx.env);
      const tables = (await all(ctx.env, "SELECT name FROM sqlite_master WHERE type = 'table'")).map((t) => t.name);
      const missing = expected.filter((t) => !tables.includes(t));
      if (missing.length) return { ok: false, database: `Tables missing: ${missing.join(", ")}. The Worker could not create them. Check Logs.` };
      const columns = (await all(ctx.env, "PRAGMA table_info(deals)")).map((c) => c.name);
      if (!columns.includes("processing_fee")) return { ok: false, database: "Database update 0002 not applied. Check Logs." };
      if (!columns.includes("photo_count")) return { ok: false, database: "Database update 0005 (item photos) not applied. Check Logs." };
      try {
        const c = createContext(ctx.env);
        if (c.payments.blocked) return { ok: false, database: "connected", settings: `Payments: ${c.payments.blocked}` };
      } catch (err) {
        return { ok: false, database: "connected", settings: err.message };
      }
      return { ok: true, database: "connected", settings: "ok" };
    } catch (err) {
      return { ok: false, database: `Database error: ${err.message}` };
    }
  });
  r.get("/api/config", async ({ ctx }) => ({
    test_mode: ctx.config.testMode,
    payment_provider: ctx.payments.name,
    payment_test: Boolean(ctx.payments.isTest),
    fee: ctx.config.fee,
    processing: ctx.config.processing,
    max_deal: ctx.config.maxDealKobo,
    min_price_delivery_multiple: ctx.config.minPriceDeliveryMultiple,
    inspection_hours: ctx.config.inspectionHours,
    states: STATES,
    courier: ctx.logistics.name,
    conditions: CONDITIONS,
    expiry_options: EXPIRY_OPTIONS,
    dispute_categories: BUYER_DISPUTE_CATEGORIES,
    dispute_photo_required: PHOTO_REQUIRED,
    max_dispute_photos: MAX_DISPUTE_PHOTOS,
    consents: CONSENTS,
    require_seller_id: ctx.config.requireSellerId
  }));
  r.get("/api/banks", async ({ ctx }) => ({ banks: await ctx.payments.listBanks() }));
  r.get("/api/deals/:token", async ({ ctx, params }) => {
    const deal = await loadDeal(ctx, params.token);
    return { deal: await publicDealView(ctx, deal), rules: RULES(deal) };
  });
  r.get("/api/evidence/:token", async ({ ctx, params }) => {
    const id = (await verifyLink(ctx.config.appSecret, params.token, ctx.now()))?.match(/^dp(\d+)$/)?.[1];
    const photo = id && await first(ctx.env, "SELECT mime, data FROM dispute_photos WHERE id = ?", Number(id));
    if (!photo) throw notFound("This photo link has expired. Reload the page to see it again.");
    return new Response(new Uint8Array(photo.data), {
      headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=3600", "Content-Security-Policy": "default-src 'none'" }
    });
  });
  r.get("/api/deals/:token/photos/:n", async ({ ctx, params }) => {
    const deal = await first(ctx.env, "SELECT id FROM deals WHERE token = ?", params.token);
    const photo = deal && await first(ctx.env, "SELECT mime, data FROM deal_photos WHERE deal_id = ? AND position = ?", deal.id, Number(params.n));
    if (!photo) throw notFound("Photo not found.");
    return new Response(new Uint8Array(photo.data), {
      headers: { "Content-Type": photo.mime, "Cache-Control": "public, max-age=31536000, immutable", "Content-Security-Policy": "default-src 'none'" }
    });
  });
  r.post("/api/deals/:token/accept", async ({ ctx, params, body }) => startCheckout(ctx, await loadDeal(ctx, params.token), body.promo_code, { acknowledged: body.penalty_acknowledged === true, termsAccepted: body.terms_accepted === true }));
  r.post("/api/deals/:token/pay", async ({ ctx, params, body }) => {
    const deal = await loadDeal(ctx, params.token);
    if (deal.status !== "open") throw new UserError("This link is no longer available.", 410);
    const { order, payment_url } = await placeOrder(ctx, { deal, input: body });
    return { payment_url, track_token: order.buyer_token };
  });
  r.get("/api/payments/callback", async ({ ctx, url }) => {
    const txRef = url.searchParams.get("tx_ref") || "";
    if (isDebtRef(txRef)) {
      const debt = await confirmDebtPayment(ctx, txRef);
      return redirect(`${ctx.config.siteUrl}/seller/dashboard.html?debt=${debt?.status === "paid" ? "paid" : "not-paid"}`);
    }
    const order = await confirmPayment(ctx, txRef, "buyer");
    if (!order) return redirect(`${ctx.config.siteUrl}/?error=payment-not-found`);
    return redirect(`${ctx.config.siteUrl}/track.html?t=${order.buyer_token}`);
  });
  r.post("/webhooks/flutterwave", async ({ ctx, request, body }) => {
    const hint = await ctx.payments.parseWebhook(request, body);
    if (!hint) return new Response("unauthorized", { status: 401 });
    if (hint.kind === "transfer") await settleTransfer(ctx, hint);
    else if (isDebtRef(hint.txRef)) await confirmDebtPayment(ctx, hint.txRef);
    else await confirmPayment(ctx, hint.txRef, "webhook");
    return new Response("ok");
  });
  r.post("/webhooks/fez", async ({ ctx, request, body }) => {
    const hint = await ctx.logistics.parseWebhook(request, body);
    if (!hint) return new Response("ignored", { status: 200 });
    if (!hint.signatureValid) console.warn("Fez webhook signature did not verify; re-checking status with Fez anyway", hint.deliveryRef);
    const order = await first(ctx.env, "SELECT * FROM orders WHERE delivery_ref = ?", hint.deliveryRef);
    if (order) await syncCourierStatus(ctx, order);
    const ret = order ? null : await first(ctx.env, "SELECT * FROM returns WHERE kind = 'pickup' AND delivery_ref = ?", hint.deliveryRef);
    if (ret) await syncReturnStatus(ctx, ret);
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
        photos: await dealPhotos(ctx, deal),
        seller_name: seller.business_name,
        seller_phone: seller.phone,
        delivery_state: o.delivery_state,
        delivery_address: o.delivery_address,
        courier_status: o.courier_status,
        delivery_status: o.delivery_status,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        pin: ["paid", "shipping"].includes(o.status) ? await revealPin(ctx, o) : null,
        ship_by: o.ship_by,
        delivered_at: o.delivered_at,
        inspection_ends_at: o.inspection_ends_at,
        refund_account: `${o.refund_bank_name} \u2022\u2022\u2022\u2022${o.refund_account_last4}`,
        price: {
          item: deal.item_price,
          delivery: buyerPart(deal.delivery_payer, o.delivery_fee),
          platform_fee: buyerPart(deal.fee_payer, o.platform_fee + o.promo_discount) - o.promo_discount,
          promo_discount: o.promo_discount,
          processing_fee: buyerPart(deal.fee_payer, o.processing_fee),
          total: o.amount
        },
        terms_hash: o.terms_hash,
        terms_accepted_at: o.terms_accepted_at,
        rules: JSON.parse(o.terms_json).rules,
        can_retry_payment: ["awaiting_payment", "cancelled"].includes(o.status) && dealNow.status === "open",
        can_confirm: o.status === "delivered",
        can_report: canReport
      },
      return: await returnView(ctx, await activeReturn(ctx, o.id)),
      dispute: dispute && {
        // Only the buyer's own photos (a later report can be the seller's, about the returned item).
        photos: dispute.opened_by === "buyer" ? await evidenceUrls(ctx, dispute.id) : [],
        opened_by: dispute.opened_by,
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
  r.get("/api/track/:token/photo-stamp", async ({ ctx, params }) => ({ stamp: await issueStamp(ctx, await loadOrderByBuyerToken(ctx, params.token)) }));
  r.post("/api/track/:token/dispute", async ({ ctx, params, body }) => {
    if (!BUYER_DISPUTE_CATEGORIES[body.category]) throw new UserError("Choose what went wrong.");
    await openDispute(ctx, await loadOrderByBuyerToken(ctx, params.token), { by: "buyer", category: body.category, description: body.description, photos: body.photos });
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
  if (!acceptedTerms(input)) throw new UserError("Tick the box to accept the TrustGap Terms of Service and Seller Terms. You can\u2019t create an account without accepting them.");
  const terms = { terms_accepted_at: iso(ctx.now()), terms_version: TOS_VERSION };
  const marketing = input.marketing_opt_in === true || input.marketing_opt_in === "yes" ? iso(ctx.now()) : null;
  if (existing) {
    await update(ctx.env, "sellers", existing.id, { full_name: fullName, business_name: businessName, email, marketing_opt_in_at: marketing, ...terms });
  } else {
    await insert(ctx.env, "sellers", { full_name: fullName, business_name: businessName, phone, email, marketing_opt_in_at: marketing, ...terms, created_at: iso(ctx.now()) });
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
async function createSession(ctx, { sellerId = null, isAdmin = false, staffId = null }) {
  const token = randomToken(32);
  const hours = isAdmin || staffId ? 12 : ctx.config.sessionDays * 24;
  await insert(ctx.env, "sessions", {
    token_hash: await sha256Hex(token),
    seller_id: sellerId,
    is_admin: isAdmin,
    ...staffId ? { staff_id: staffId } : {},
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
async function logout(ctx, session2) {
  if (session2) await run(ctx.env, "DELETE FROM sessions WHERE token_hash = ?", session2.token_hash);
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
    pickup_state: s.pickup_state,
    payout: s.payout_verified_at ? { bank_name: s.payout_bank_name, account_number: s.payout_account_number, account_name: s.payout_account_name } : null,
    identity_verified: Boolean(s.identity_verified_at),
    identity_verified_at: s.identity_verified_at,
    id_type: s.id_type,
    id_attempts_left: Math.max(0, 3 - (s.id_attempts || 0)),
    amount_owed: s.amount_owed,
    marketing_opt_in: Boolean(s.marketing_opt_in_at),
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
    throw new UserError(err.locked ? err.message : `Payout account: ${err.message}`, err.locked ? 503 : 400);
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
    return left > 0 ? ` You have ${left} attempt${left > 1 ? "s" : ""} left.` : " That was your last attempt. Please contact TrustGap support.";
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
  const session2 = await authenticate(ctx, request);
  if (!session2?.seller_id) throw new UserError("Please log in.", 401);
  const seller = await getSeller(ctx, session2.seller_id);
  if (!seller) throw new UserError("Please log in.", 401);
  return { session: session2, seller };
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
  pickup_state: d.pickup_state,
  delivery_address: d.delivery_address,
  delivery_landmark: d.delivery_landmark,
  delivery_state: d.delivery_state,
  weight_kg: d.weight_kg,
  fragile: Boolean(d.fragile),
  delivery_payer: d.delivery_payer,
  fee_payer: d.fee_payer,
  delivery_days: d.delivery_days,
  expires_at: d.expires_at,
  created_at: d.created_at,
  price: priceBreakdown(d),
  promo_code: d.promo_code || null
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
      `SELECT o.id, o.ref, o.status, o.buyer_name, o.paid_at, o.amount, o.seller_payout, d.item_title
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
  r.post("/api/seller/debt/pay", async ({ ctx, request }) => startDebtPayment(ctx, (await requireSeller(ctx, request)).seller));
  r.post("/api/seller/marketing", async ({ ctx, request, body }) => {
    const { seller } = await requireSeller(ctx, request);
    await update(ctx.env, "sellers", seller.id, { marketing_opt_in_at: body.opt_in === true ? iso(ctx.now()) : null });
    return { marketing_opt_in: body.opt_in === true };
  });
  r.post("/api/seller/quote", async ({ ctx, request, body }) => {
    return previewDeal(ctx, body, (await requireSeller(ctx, request)).seller);
  });
  r.post("/api/seller/deals", async ({ ctx, request, body }) => {
    const deal = await createDeal(ctx, (await requireSeller(ctx, request)).seller, body);
    return { deal: { ...dealView(ctx, deal), photos: await dealPhotos(ctx, deal) } };
  });
  r.get("/api/seller/deals/:id", async ({ ctx, request, params }) => {
    const { seller } = await requireSeller(ctx, request);
    const d = await first(ctx.env, "SELECT * FROM deals WHERE id = ? AND seller_id = ?", Number(params.id), seller.id);
    if (!d) throw notFound("Link not found.");
    const order = await first(ctx.env, "SELECT id FROM orders WHERE deal_id = ? AND status NOT IN ('awaiting_payment','cancelled','duplicate_refunded')", d.id);
    return { deal: { ...dealView(ctx, await refreshDeal(ctx, d)), photos: await dealPhotos(ctx, d) }, order_id: order?.id || null };
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
        photos: await dealPhotos(ctx, d),
        seller_payout: o.seller_payout,
        delivery_fee: o.delivery_fee,
        delivery_payer: d.delivery_payer,
        courier_status: o.courier_status,
        buyer_name: o.buyer_name,
        delivery_state: o.delivery_state,
        delivery_status: o.delivery_status,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        packing_note: o.packing_note,
        ship_by: o.ship_by,
        delivered_at: o.delivered_at,
        inspection_ends_at: o.inspection_ends_at
      },
      dispute,
      // Includes the return PIN while the item is on its way back, to give the rider at hand-back.
      return: await returnView(ctx, await activeReturn(ctx, o.id), { withPin: true }),
      events: await all(ctx.env, "SELECT type, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id", o.id)
    };
  });
  const sellerReturn = /* @__PURE__ */ __name(async (ctx, request, id) => {
    const { seller } = await requireSeller(ctx, request);
    const o = await first(ctx.env, "SELECT * FROM orders WHERE id = ? AND seller_id = ?", Number(id), seller.id);
    if (!o) throw notFound("Order not found.");
    const ret = await activeReturn(ctx, o.id);
    if (!isOpenReturn(ret)) throw new UserError("There is no return waiting on this order.");
    return { order: o, ret };
  }, "sellerReturn");
  r.get("/api/seller/orders/:id/photo-stamp", async ({ ctx, request, params }) => ({ stamp: await issueStamp(ctx, (await sellerReturn(ctx, request, params.id)).order) }));
  r.post("/api/seller/orders/:id/return-problem", async ({ ctx, request, params, body }) => {
    await reportReturnProblem(ctx, (await sellerReturn(ctx, request, params.id)).ret, body);
    return { ok: true };
  });
  r.post("/api/seller/orders/:id/return-received", async ({ ctx, request, params }) => {
    const { seller } = await requireSeller(ctx, request);
    const o = await first(ctx.env, "SELECT id FROM orders WHERE id = ? AND seller_id = ?", Number(params.id), seller.id);
    if (!o) throw notFound("Order not found.");
    const ret = await activeReturn(ctx, o.id);
    if (!isOpenReturn(ret)) throw new UserError("There is no return waiting on this order.");
    await receiveReturn(ctx, ret, "seller");
    return { ok: true };
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
  const result = { expired: 0, cancelled: 0, released: 0, notShipped: 0, couriersChecked: 0, transfersSent: 0, transfersChecked: 0, resent: 0 };
  result.expired = (await run(ctx.env, "UPDATE deals SET status = 'expired' WHERE status = 'open' AND expires_at <= ?", now)).meta.changes;
  const photoCutoff = iso(new Date(ctx.now().getTime() - 30 * 24 * 36e5));
  result.photosDeleted = (await run(ctx.env, `DELETE FROM deal_photos WHERE deal_id IN (
    SELECT d.id FROM deals d WHERE d.status IN ('expired', 'cancelled', 'replaced') AND d.created_at <= ?
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.deal_id = d.id AND o.status NOT IN ('awaiting_payment', 'cancelled')))`, photoCutoff)).meta.changes;
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
  for (const o of await all(ctx.env, "SELECT * FROM orders WHERE status = 'shipping' AND courier = ? AND delivery_ref IS NOT NULL LIMIT 30", ctx.logistics.name)) {
    try {
      if (await syncCourierStatus(ctx, o)) result.couriersChecked++;
    } catch (err) {
      console.error("courier status check failed", o.ref, err.message);
    }
  }
  for (const ret of await all(ctx.env, "SELECT * FROM returns WHERE kind = 'pickup' AND courier = ? AND delivery_ref IS NOT NULL AND status IN ('booked', 'picked_up', 'out_for_delivery', 'attempt_failed') LIMIT 30", ctx.logistics.name)) {
    try {
      if (await syncReturnStatus(ctx, ret)) result.couriersChecked++;
    } catch (err) {
      console.error("return status check failed", ret.id, err.message);
    }
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
    sql: `SELECT o.*, d.item_title, d.condition_confirmed_at, s.business_name
          FROM orders o JOIN deals d ON d.id = o.deal_id JOIN sellers s ON s.id = o.seller_id
          WHERE o.status != 'cancelled' ORDER BY o.id DESC LIMIT ${ROW_LIMIT}`,
    header: [
      "Ref",
      "Status",
      "Item",
      "Seller",
      "Buyer",
      "Buyer phone",
      "Delivery state",
      "Paid (\u20A6)",
      "Seller gets (\u20A6)",
      "Delivery",
      "Paid at",
      "Delivered at",
      "Closed at",
      "Created at",
      "Seller confirmed condition at",
      "Buyer accepted change-of-mind notice at",
      "Buyer accepted Terms of Service at"
    ],
    row: /* @__PURE__ */ __name((o) => [
      o.ref,
      o.status,
      o.item_title,
      o.business_name,
      o.buyer_name,
      o.buyer_phone,
      o.delivery_state || "",
      naira(o.amount),
      naira(o.seller_payout),
      o.delivery_status,
      o.paid_at,
      o.delivered_at,
      o.closed_at,
      o.created_at,
      o.condition_confirmed_at || "",
      o.buyer_ack_at || "",
      o.buyer_terms_accepted_at || ""
    ], "row")
  },
  Sellers: {
    sql: `SELECT * FROM sellers ORDER BY id DESC LIMIT ${ROW_LIMIT}`,
    header: ["ID", "Business", "Full name", "Phone", "Email", "Phone verified", "ID verified", "Payout bank", "Owes (\u20A6)", "Suspended", "Joined", "News & offers opt-in", "Accepted Terms of Service at", "Terms version"],
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
      s.created_at,
      s.marketing_opt_in_at || "",
      s.terms_accepted_at || "",
      s.terms_version || ""
    ], "row")
  },
  // Sellers and buyers who ticked "send me TrustGap news and offers". Only these may get newsletters
  // and promotions. One row per buyer phone number (their latest order).
  "Marketing contacts": {
    sql: `SELECT 'seller' AS role, full_name AS name, business_name, phone, email, marketing_opt_in_at AS opted_in_at, 'seller sign-up' AS source
            FROM sellers WHERE marketing_opt_in_at IS NOT NULL
          UNION ALL
          SELECT 'buyer', o.buyer_name, '', o.buyer_phone, o.buyer_email, o.buyer_marketing_opt_in_at, 'order ' || o.ref
            FROM orders o WHERE o.buyer_marketing_opt_in_at IS NOT NULL AND o.status NOT IN ('awaiting_payment', 'cancelled')
              AND o.id = (SELECT MAX(id) FROM orders o2 WHERE o2.buyer_phone = o.buyer_phone AND o2.buyer_marketing_opt_in_at IS NOT NULL
                          AND o2.status NOT IN ('awaiting_payment', 'cancelled'))
          ORDER BY opted_in_at DESC LIMIT ${ROW_LIMIT}`,
    header: ["Role", "Name", "Business", "Phone", "Email", "Opted in at", "Source"],
    row: /* @__PURE__ */ __name((c) => [c.role, c.name, c.business_name || "", c.phone, c.email || "", c.opted_in_at, c.source], "row")
  },
  Returns: {
    sql: `SELECT r.*, o.ref FROM returns r JOIN orders o ON o.id = r.order_id ORDER BY r.id DESC LIMIT ${ROW_LIMIT}`,
    header: ["Order", "Kind", "Status", "Courier", "Courier ref", "Cost (\u20A6)", "Hand-over deadline", "Received at", "Confirmed by", "Started"],
    row: /* @__PURE__ */ __name((r) => [
      r.ref,
      r.kind === "door" ? "refused at door" : "collected from buyer",
      r.status,
      r.courier || "",
      r.delivery_ref || "",
      naira(r.cost),
      r.deadline_at || "",
      r.received_at || "",
      r.received_by || "",
      r.created_at
    ], "row")
  },
  "Debt payments": {
    sql: `SELECT p.*, s.business_name FROM debt_payments p JOIN sellers s ON s.id = p.seller_id ORDER BY p.id DESC LIMIT ${ROW_LIMIT}`,
    header: ["ID", "Seller", "Amount (\u20A6)", "Status", "Provider ref", "Started", "Paid at"],
    row: /* @__PURE__ */ __name((p) => [p.id, p.business_name, naira(p.amount), p.status, p.provider_tx_id || "", p.created_at, p.paid_at || ""], "row")
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
        ["TrustGap: read-only copy. Edits here are overwritten."],
        ["Last synced", ctx.now().toISOString()],
        ["Money held for open orders (\u20A6)", naira(held.t)],
        ["Open disputes", openDisputes.n]
      ]
    }
  ];
  for (const [title, tab] of Object.entries(TABS)) {
    const rows = await all(env, tab.sql);
    data.push({ range: `'${title}'!A1`, values: [tab.header, ...rows.map(tab.row)] });
  }
  await google("POST", "/values:batchClear", { ranges: Object.keys(tabs).map((t) => `'${t}'!A:Z`) });
  await google("POST", "/values:batchUpdate", { valueInputOption: "RAW", data });
  await run(env, "INSERT INTO meta (key, value) VALUES ('sheets_synced_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", ctx.now().toISOString());
  return { synced: data.length };
}
__name(syncSheets, "syncSheets");

// src/routes/admin.js
async function requireAdmin(ctx, request) {
  const session2 = await authenticate(ctx, request);
  if (!session2?.is_admin) throw new UserError("Admin login required.", 401);
}
__name(requireAdmin, "requireAdmin");
async function riderJob(ctx, token) {
  const data = await verifyLink(ctx.config.appSecret, token, ctx.now());
  const invalid = /* @__PURE__ */ __name(() => new UserError("This rider link is invalid or has expired.", 404), "invalid");
  if (data?.startsWith("return-")) {
    const ret = await first(ctx.env, "SELECT * FROM returns WHERE id = ?", Number(data.slice(7)));
    if (!ret) throw invalid();
    return { order: await getOrder(ctx, ret.order_id), ret };
  }
  const id = data?.startsWith("rider-") ? Number(data.slice(6)) : null;
  const order = id && await getOrder(ctx, id);
  if (!order) throw invalid();
  return { order, ret: null };
}
__name(riderJob, "riderJob");
async function riderOrder(ctx, token) {
  const { order, ret } = await riderJob(ctx, token);
  if (ret) throw new UserError("This is a return link.");
  return order;
}
__name(riderOrder, "riderOrder");
function riderRoutes(r) {
  r.get("/api/rider/:token", async ({ ctx, params }) => {
    const { order: o, ret: returnJob } = await riderJob(ctx, params.token);
    const d = await getDeal(ctx, o.deal_id);
    const s = await getSeller(ctx, o.seller_id);
    const seller = { name: s.business_name, phone: s.phone, address: d.pickup_address };
    const buyer = { name: o.buyer_name, phone: o.buyer_phone, address: o.delivery_address, landmark: o.delivery_landmark };
    const ret = returnJob || await activeReturn(ctx, o.id);
    const doorReturn = !returnJob && ret?.kind === "door" ? await returnView(ctx, ret) : null;
    return {
      order: {
        mode: returnJob ? "return" : "delivery",
        return: returnJob ? await returnView(ctx, returnJob) : doorReturn,
        ref: o.ref,
        status: o.status,
        delivery_status: o.delivery_status,
        delivery_label: returnJob ? RETURN_LABELS[returnJob.status] : DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        item_title: d.item_title,
        item_condition: d.item_condition,
        item_description: d.item_description,
        quantity: d.quantity,
        packing_note: o.packing_note,
        pickup: returnJob ? buyer : seller,
        dropoff: returnJob ? seller : buyer
      }
    };
  });
  r.post("/api/rider/:token/status", async ({ ctx, params, body }) => {
    const { order, ret } = await riderJob(ctx, params.token);
    if (ret) await applyReturnUpdate(ctx, ret, { status: body.status, note: body.note, actor: "rider" });
    else await applyDeliveryUpdate(ctx, order, { status: body.status, note: body.note, actor: "rider" });
    return { ok: true };
  });
  r.post("/api/rider/:token/return-pin", async ({ ctx, params, body }) => {
    const { order, ret } = await riderJob(ctx, params.token);
    const job = ret || await activeReturn(ctx, order.id);
    if (!isOpenReturn(job)) throw new UserError("There is no return to confirm on this link.");
    await verifyReturnPin(ctx, job, body.pin, "rider");
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
        track_url: trackUrl(ctx, o)
      },
      deal: d,
      photos: await dealPhotos(ctx, d),
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
      disputes: await Promise.all((await all(ctx.env, "SELECT * FROM disputes WHERE order_id = ? ORDER BY id", o.id)).map(async (x) => ({
        ...x,
        category_label: DISPUTE_CATEGORIES[x.category] || x.category,
        photos: await evidenceDetails(ctx, x.id)
      }))),
      return: await (async () => {
        const ret = await activeReturn(ctx, o.id);
        return ret && {
          ...await returnView(ctx, ret),
          courier: ret.courier,
          delivery_ref: ret.delivery_ref,
          rider_url: ret.rider_url,
          courier_status: ret.courier_status,
          pin_attempts: ret.pin_attempts,
          cost: ret.cost,
          overdue: Boolean(ret.deadline_at && ["booked", "attempt_failed"].includes(ret.status) && new Date(ret.deadline_at) < ctx.now())
        };
      })(),
      ledger: await all(ctx.env, "SELECT * FROM ledger WHERE order_id = ? ORDER BY id", o.id),
      events: await all(ctx.env, "SELECT * FROM order_events WHERE order_id = ? ORDER BY id", o.id),
      messages: await all(ctx.env, "SELECT * FROM outbox WHERE order_id = ? ORDER BY id", o.id)
    };
  }));
  r.post("/api/admin/disputes/:id/resolve", admin(async ({ ctx, params, body }) => ({ ok: true, ...await resolveDispute(ctx, Number(params.id), body) })));
  const adminReturn = /* @__PURE__ */ __name(async (ctx, id) => {
    const ret = await first(ctx.env, "SELECT * FROM returns WHERE id = ?", Number(id));
    if (!ret) throw notFound("Return not found.");
    return ret;
  }, "adminReturn");
  r.post("/api/admin/returns/:id/received", admin(async ({ ctx, params }) => {
    if (!await receiveReturn(ctx, await adminReturn(ctx, params.id), "admin")) throw new UserError("This return is already closed.");
    return { ok: true };
  }));
  r.post("/api/admin/returns/:id/cancel", admin(async ({ ctx, params, body }) => {
    await cancelReturn(ctx, await adminReturn(ctx, params.id), body.note);
    return { ok: true };
  }));
  r.post("/api/admin/returns/:id/sync-courier", admin(async ({ ctx, params }) => {
    const st = await syncReturnStatus(ctx, await adminReturn(ctx, params.id));
    return { status: st?.raw || "no update" };
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
  r.post("/api/admin/orders/:id/sync-courier", admin(async ({ ctx, params }) => {
    const o = await getOrder(ctx, Number(params.id));
    if (!o) throw notFound("Order not found.");
    const st = await syncCourierStatus(ctx, o);
    return { status: st ? st.raw : "No courier status (manual rider, or not booked yet)." };
  }));
  r.post("/api/admin/courier/register-webhook", admin(async ({ ctx }) => {
    if (!ctx.logistics.registerWebhook) throw new UserError("Webhooks are only needed with LOGISTICS_PROVIDER=fez.");
    const url = `${ctx.config.apiUrl}/webhooks/fez`;
    await ctx.logistics.registerWebhook(url);
    return { registered: url };
  }));
  r.post("/api/admin/jobs", admin(async ({ ctx }) => ({ result: await runJobs(ctx) })));
  r.post("/api/admin/sync-sheets", admin(async ({ ctx }) => ({ result: await syncSheets(ctx) })));
}
__name(adminRoutes, "adminRoutes");

// src/core/team.js
var ROLES = { customer_relations: "Customer relations" };
var TASK_STATUSES = { todo: "To do", in_progress: "In progress", done: "Done" };
var PRIORITIES = { normal: "Normal", high: "High" };
var TASK_KINDS = { general: "General", decide_dispute: "Decide a dispute" };
var MIN_PASSWORD = 10;
var staffView = /* @__PURE__ */ __name((s) => ({
  id: s.id,
  name: s.name,
  email: s.email,
  phone: s.phone,
  role: s.role,
  role_label: ROLES[s.role] || s.role,
  must_change_password: Boolean(s.must_change_password),
  disabled: Boolean(s.disabled_at),
  last_login_at: s.last_login_at,
  created_at: s.created_at
}), "staffView");
function newPassword(input, label = "Password") {
  const p = String(input ?? "");
  if (p.length < MIN_PASSWORD) throw new UserError(`${label} must be at least ${MIN_PASSWORD} characters.`);
  if (p.length > 200) throw new UserError(`${label} is too long.`);
  return p;
}
__name(newPassword, "newPassword");
async function listStaff(ctx) {
  return (await all(ctx.env, "SELECT * FROM staff ORDER BY disabled_at IS NOT NULL, name")).map(staffView);
}
__name(listStaff, "listStaff");
async function createStaff(ctx, input) {
  const name = requireLength(input.name, "Name", 2, 100);
  const email = validEmail(input.email);
  const phone = str(input.phone) ? normalisePhone(input.phone) : null;
  const role = ROLES[input.role] ? input.role : "customer_relations";
  const password = newPassword(input.password, "Temporary password");
  if (await first(ctx.env, "SELECT id FROM staff WHERE email = ?", email)) throw new UserError("A team member with this email already exists.");
  const id = await insert(ctx.env, "staff", {
    name,
    email,
    phone,
    role,
    password_hash: await hashPassword(password),
    must_change_password: 1,
    created_at: iso(ctx.now())
  });
  return staffView(await first(ctx.env, "SELECT * FROM staff WHERE id = ?", id));
}
__name(createStaff, "createStaff");
async function updateStaff(ctx, id, input) {
  const s = await first(ctx.env, "SELECT * FROM staff WHERE id = ?", Number(id));
  if (!s) throw new UserError("Team member not found.", 404);
  const fields = {};
  if (input.password !== void 0) Object.assign(fields, { password_hash: await hashPassword(newPassword(input.password, "Temporary password")), must_change_password: 1 });
  if (input.disabled === true) fields.disabled_at = iso(ctx.now());
  if (input.disabled === false) fields.disabled_at = null;
  if (!Object.keys(fields).length) throw new UserError("Nothing to change.");
  await update(ctx.env, "staff", s.id, fields);
  if (fields.password_hash || fields.disabled_at) await run(ctx.env, "DELETE FROM sessions WHERE staff_id = ?", s.id);
  return staffView(await first(ctx.env, "SELECT * FROM staff WHERE id = ?", s.id));
}
__name(updateStaff, "updateStaff");
async function staffLogin(ctx, input) {
  const email = str(input.email).toLowerCase();
  const key = `team_fails:${email}`;
  const windowStart = iso(new Date(ctx.now().getTime() - 15 * 6e4));
  const fails = JSON.parse((await first(ctx.env, "SELECT value FROM meta WHERE key = ?", key))?.value || "[]").filter((t) => t > windowStart);
  if (fails.length >= 8) throw new UserError("Too many attempts. Try again in 15 minutes.", 429);
  const s = await first(ctx.env, "SELECT * FROM staff WHERE lower(email) = ?", email);
  if (!s || s.disabled_at || !await checkPassword(input.password, s.password_hash)) {
    fails.push(iso(ctx.now()));
    await run(ctx.env, "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(fails));
    throw new UserError("Wrong email or password.", 401);
  }
  await update(ctx.env, "staff", s.id, { last_login_at: iso(ctx.now()) });
  return { token: await createSession(ctx, { staffId: s.id }), staff: staffView(s) };
}
__name(staffLogin, "staffLogin");
async function changeOwnPassword(ctx, staff, input) {
  if (!await checkPassword(input.current_password, staff.password_hash)) throw new UserError("Your current password is wrong.");
  const next = newPassword(input.new_password, "New password");
  if (next === input.current_password) throw new UserError("Choose a password you haven\u2019t used here before.");
  await update(ctx.env, "staff", staff.id, { password_hash: await hashPassword(next), must_change_password: 0 });
  return staffView(await first(ctx.env, "SELECT * FROM staff WHERE id = ?", staff.id));
}
__name(changeOwnPassword, "changeOwnPassword");
var meView = staffView;
async function taskRows(ctx, where, ...args) {
  const rows = await all(ctx.env, `SELECT t.*, s.name AS assignee_name, o.ref AS order_ref FROM tasks t
    LEFT JOIN staff s ON s.id = t.assigned_to LEFT JOIN orders o ON o.id = t.order_id
    WHERE ${where} ORDER BY t.status = 'done', t.priority = 'high' DESC, COALESCE(t.due_at, '9999') , t.id DESC LIMIT 300`, ...args);
  const notes = rows.length ? await all(ctx.env, `SELECT * FROM task_notes WHERE task_id IN (${rows.map(() => "?").join(", ")}) ORDER BY id`, ...rows.map((r) => r.id)) : [];
  return rows.map((t) => ({
    ...t,
    status_label: TASK_STATUSES[t.status] || t.status,
    kind_label: TASK_KINDS[t.kind] || t.kind,
    overdue: Boolean(t.due_at && t.status !== "done" && new Date(t.due_at) < ctx.now()),
    notes: notes.filter((n) => n.task_id === t.id)
  }));
}
__name(taskRows, "taskRows");
var allTasks = /* @__PURE__ */ __name((ctx) => taskRows(ctx, "1 = 1"), "allTasks");
var tasksFor = /* @__PURE__ */ __name((ctx, staffId) => taskRows(ctx, "t.assigned_to = ?", staffId), "tasksFor");
async function orderIdFromRef(ctx, ref) {
  const r = str(ref).toUpperCase();
  if (!r) return null;
  const o = await first(ctx.env, "SELECT id FROM orders WHERE ref = ?", r);
  if (!o) throw new UserError(`No order with reference ${r}.`);
  return o.id;
}
__name(orderIdFromRef, "orderIdFromRef");
function dueDate(input) {
  if (!str(input)) return null;
  const d = /* @__PURE__ */ new Date(`${str(input)}T18:00:00+01:00`);
  if (Number.isNaN(d.getTime())) throw new UserError("Choose a valid due date.");
  return iso(d);
}
__name(dueDate, "dueDate");
async function createTask(ctx, input) {
  const title = requireLength(input.title, "Task title", 3, 160);
  const details = str(input.details).slice(0, 4e3) || null;
  const assignee = await first(ctx.env, "SELECT * FROM staff WHERE id = ? AND disabled_at IS NULL", Number(input.assigned_to));
  if (!assignee) throw new UserError("Choose who the task is for.");
  const now = iso(ctx.now());
  const orderId = await orderIdFromRef(ctx, input.order_ref);
  const kind = TASK_KINDS[input.kind] ? input.kind : "general";
  if (kind === "decide_dispute") await requireOpenDispute(ctx, orderId);
  const id = await insert(ctx.env, "tasks", {
    title,
    details,
    kind,
    order_id: orderId,
    assigned_to: assignee.id,
    priority: PRIORITIES[input.priority] ? input.priority : "normal",
    status: "todo",
    due_at: dueDate(input.due_date),
    created_at: now,
    updated_at: now
  });
  await notifyAssignee(ctx, assignee, `TrustGap: new task for you: "${title}". Open the team portal: ${ctx.config.siteUrl}/team/index.html`);
  return (await taskRows(ctx, "t.id = ?", id))[0];
}
__name(createTask, "createTask");
async function requireOpenDispute(ctx, orderId) {
  if (!orderId) throw new UserError('A "Decide a dispute" task needs the order reference.');
  if (!await first(ctx.env, "SELECT id FROM disputes WHERE order_id = ? AND status = 'open'", orderId)) {
    throw new UserError("That order has no open dispute to decide.");
  }
}
__name(requireOpenDispute, "requireOpenDispute");
async function notifyAssignee(ctx, staff, sms) {
  if (!staff.phone && !staff.email) return;
  await ctx.notify.send({ event: "task_assigned", phone: staff.phone, email: staff.email, sms, emailSubject: "New TrustGap task" });
}
__name(notifyAssignee, "notifyAssignee");
async function updateTask(ctx, id, input) {
  const t = await first(ctx.env, "SELECT * FROM tasks WHERE id = ?", Number(id));
  if (!t) throw new UserError("Task not found.", 404);
  const fields = { updated_at: iso(ctx.now()) };
  if (input.title !== void 0) fields.title = requireLength(input.title, "Task title", 3, 160);
  if (input.details !== void 0) fields.details = str(input.details).slice(0, 4e3) || null;
  if (input.priority !== void 0 && PRIORITIES[input.priority]) fields.priority = input.priority;
  if (input.due_date !== void 0) fields.due_at = dueDate(input.due_date);
  if (input.order_ref !== void 0) fields.order_id = await orderIdFromRef(ctx, input.order_ref);
  if (input.kind !== void 0 && TASK_KINDS[input.kind]) fields.kind = input.kind;
  if ((fields.kind || t.kind) === "decide_dispute" && (fields.kind || fields.order_id !== void 0)) {
    await requireOpenDispute(ctx, fields.order_id !== void 0 ? fields.order_id : t.order_id);
  }
  if (input.status !== void 0) Object.assign(fields, statusFields(ctx, input.status));
  let newAssignee = null;
  if (input.assigned_to !== void 0 && Number(input.assigned_to) !== t.assigned_to) {
    newAssignee = await first(ctx.env, "SELECT * FROM staff WHERE id = ? AND disabled_at IS NULL", Number(input.assigned_to));
    if (!newAssignee) throw new UserError("Choose who the task is for.");
    fields.assigned_to = newAssignee.id;
  }
  await update(ctx.env, "tasks", t.id, fields);
  if (newAssignee) await notifyAssignee(ctx, newAssignee, `TrustGap: a task was passed to you: "${fields.title || t.title}". ${ctx.config.siteUrl}/team/index.html`);
  return (await taskRows(ctx, "t.id = ?", t.id))[0];
}
__name(updateTask, "updateTask");
function statusFields(ctx, status) {
  if (!TASK_STATUSES[status]) throw new UserError("Unknown task status.");
  return { status, completed_at: status === "done" ? iso(ctx.now()) : null };
}
__name(statusFields, "statusFields");
async function setTaskStatus(ctx, staff, id, status) {
  const t = await first(ctx.env, "SELECT * FROM tasks WHERE id = ? AND assigned_to = ?", Number(id), staff.id);
  if (!t) throw new UserError("Task not found.", 404);
  await update(ctx.env, "tasks", t.id, { ...statusFields(ctx, status), updated_at: iso(ctx.now()) });
  await addNote(ctx, t.id, staff.name, `Marked "${TASK_STATUSES[status]}".`);
  return (await taskRows(ctx, "t.id = ?", t.id))[0];
}
__name(setTaskStatus, "setTaskStatus");
async function addNote(ctx, taskId, author, body) {
  const text = requireLength(body, "Note", 2, 2e3);
  await insert(ctx.env, "task_notes", { task_id: taskId, author, body: text, created_at: iso(ctx.now()) });
  await run(ctx.env, "UPDATE tasks SET updated_at = ? WHERE id = ?", iso(ctx.now()), taskId);
}
__name(addNote, "addNote");
async function staffNote(ctx, staff, id, body) {
  const t = await first(ctx.env, "SELECT id FROM tasks WHERE id = ? AND assigned_to = ?", Number(id), staff.id);
  if (!t) throw new UserError("Task not found.", 404);
  await addNote(ctx, t.id, staff.name, body);
  return (await taskRows(ctx, "t.id = ?", t.id))[0];
}
__name(staffNote, "staffNote");
async function teamOrderView(ctx, staff, orderId) {
  const linked = await first(ctx.env, "SELECT id FROM tasks WHERE order_id = ? AND assigned_to = ?", Number(orderId), staff.id);
  if (!linked) throw new UserError("You can only open orders that one of your tasks is about.", 403);
  const o = await getOrder(ctx, Number(orderId));
  const d = await getDeal(ctx, o.deal_id);
  const s = await getSeller(ctx, o.seller_id);
  const disputes = await all(ctx.env, "SELECT id, opened_by, category, description, status, resolution_note, buyer_refund, seller_payout, seller_charge, decided_by, created_at FROM disputes WHERE order_id = ? ORDER BY id", o.id);
  const decideTask = await decisionTask(ctx, staff, o.id);
  return {
    order: {
      id: o.id,
      ref: o.ref,
      status: o.status,
      amount: o.amount,
      created_at: o.created_at,
      paid_at: o.paid_at,
      item_title: d.item_title,
      item_condition: d.item_condition,
      item_description: d.item_description,
      quantity: d.quantity,
      delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
      courier: o.courier,
      delivery_ref: o.delivery_ref,
      courier_status: o.courier_status,
      ship_by: o.ship_by,
      delivered_at: o.delivered_at,
      inspection_ends_at: o.inspection_ends_at,
      packing_note: o.packing_note,
      buyer: { name: o.buyer_name, phone: o.buyer_phone, email: o.buyer_email, state: o.delivery_state, address: o.delivery_address },
      seller: { business_name: s.business_name, name: s.full_name, phone: s.phone, email: s.email, identity_verified: Boolean(s.identity_verified_at) }
    },
    disputes: await Promise.all(disputes.map(async (x) => ({ ...x, category_label: DISPUTE_CATEGORIES[x.category] || x.category, photos: await evidenceDetails(ctx, x.id) }))),
    // Present only while she holds an open "Decide a dispute" task for this order: what the decision form needs.
    decide: decideTask && {
      task_id: decideTask.id,
      dispute_id: disputes.find((x) => x.status === "open")?.id,
      amount: o.amount,
      seller_payout: o.seller_payout,
      delivery_fee: o.delivery_fee,
      delivered: Boolean(o.delivered_at),
      item_with_seller: await (async () => {
        const r = await activeReturn(ctx, o.id);
        return Boolean(r && !r.problem_at);
      })(),
      return_problem: (await activeReturn(ctx, o.id))?.problem_note || null,
      condition_pledge: d.condition_pledge,
      buyer_ack_at: o.buyer_ack_at
    },
    return: await returnView(ctx, await activeReturn(ctx, o.id)),
    events: await all(ctx.env, "SELECT type, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id", o.id)
  };
}
__name(teamOrderView, "teamOrderView");
async function decisionTask(ctx, staff, orderId) {
  const task = await first(ctx.env, "SELECT * FROM tasks WHERE order_id = ? AND assigned_to = ? AND kind = 'decide_dispute' AND status != 'done' ORDER BY id DESC", orderId, staff.id);
  if (!task) return null;
  return await first(ctx.env, "SELECT id FROM disputes WHERE order_id = ? AND status = 'open'", orderId) ? task : null;
}
__name(decisionTask, "decisionTask");
async function teamResolveDispute(ctx, staff, disputeId, input) {
  const dispute = await first(ctx.env, "SELECT * FROM disputes WHERE id = ?", Number(disputeId));
  const task = dispute && await decisionTask(ctx, staff, dispute.order_id);
  if (!task || dispute.status !== "open") throw new UserError("You can only decide a dispute the admin has asked you to decide, while it is open.", 403);
  const result = await resolveDispute(ctx, dispute.id, input, { by: `team:${staff.name}` });
  const d = await first(ctx.env, "SELECT * FROM disputes WHERE id = ?", dispute.id);
  const naira2 = /* @__PURE__ */ __name((k) => "\u20A6" + (k / 100).toLocaleString("en-NG"), "naira");
  await addNote(ctx, task.id, staff.name, `Decided: refund ${naira2(d.buyer_refund)}, seller paid ${naira2(d.seller_payout)}, seller charged ${naira2(d.seller_charge)}.${result.waiting_for_return ? " Money moves once the seller has the item back." : ""} Reason: ${d.resolution_note}`);
  await update(ctx.env, "tasks", task.id, { status: "done", completed_at: iso(ctx.now()), updated_at: iso(ctx.now()) });
  return result;
}
__name(teamResolveDispute, "teamResolveDispute");

// src/manual.js
var MANUAL = {
  updated: "2026-10-29",
  // decide-a-dispute tasks added
  sections: [
    {
      id: "start",
      title: "Start here",
      html: `
<p>This manual explains how TrustGap works from end to end, so you can answer buyers and sellers, follow an order and know when to pass something to the admin. Read it once fully, then keep it open while you work.</p>
<h3>TrustGap in one paragraph</h3>
<p>Buyers on WhatsApp and Instagram are afraid to pay first; sellers are afraid to ship first. TrustGap sits in the middle. The seller sends a TrustGap payment link. The buyer reviews the deal and pays TrustGap. The money is held while the item is delivered and checked. The seller is paid only after delivery and the inspection window. If something goes wrong, TrustGap reviews the evidence and decides who gets what, using rules both sides agreed to before paying.</p>
<h3>Your role</h3>
<ul>
<li>You talk to buyers and sellers, find out what happened, collect evidence and keep them informed.</li>
<li>You work through the tasks the admin assigns you on the team portal.</li>
<li><strong>You decide a dispute only when the admin gives you a \u201CDecide a dispute\u201D task for that order.</strong> Then you can decide that one dispute, with the same rules and checks as the admin, until the task is done. Every decision is recorded under your name. Otherwise you never decide or move money: you tell people what the rules say and what happens next, not what the decision will be.</li>
</ul>
<h3>Words we use, and words we never use</h3>
<ul>
<li>Say: \u201Cpayment secured\u201D, \u201Cheld by TrustGap\u201D, \u201Creleased to the seller\u201D, \u201Crefunded to your account\u201D.</li>
<li>Never say \u201Cescrow\u201D, \u201Cguaranteed\u201D or \u201Cinsured\u201D. TrustGap is not a bank and does not guarantee items or sellers. It runs a defined process.</li>
<li>Never promise an outcome (\u201Cyou will definitely get your money back\u201D). Say what the rules are and that TrustGap reviews the evidence.</li>
</ul>`
    },
    {
      id: "people",
      title: "Who is involved",
      html: `
<table>
<tr><th>Who</th><th>What they do</th></tr>
<tr><td>Seller</td><td>Signs up, verifies their identity (NIN) and payout bank account, creates payment links, packs and hands the item to the courier.</td></tr>
<tr><td>Buyer</td><td>Gets a link from the seller. No account. Reviews the deal, pays, gives the rider a PIN after checking the item, reports problems.</td></tr>
<tr><td>Rider / courier</td><td>Fez Delivery (or our own rider during the pilot). Collects from the seller, delivers, takes the buyer\u2019s PIN, brings returns back.</td></tr>
<tr><td>Admin</td><td>Runs TrustGap: decides disputes, moves money, manages sellers, assigns your tasks.</td></tr>
<tr><td>You (team)</td><td>Customer relations: contact, follow-up, evidence, explaining the process.</td></tr>
</table>
<h3>Partners behind the scenes</h3>
<ul>
<li><strong>Flutterwave</strong>: takes the buyer\u2019s payment and sends payouts and refunds. Its checkout page shows our registered business name, <em>Tubalcain Ads Enterprise</em>, not \u201CTrustGap\u201D. That is normal; reassure buyers it is us.</li>
<li><strong>Monnify</strong>: checks a seller\u2019s NIN matches their name.</li>
<li><strong>Fez Delivery</strong>: the courier. Each delivery and each return is a Fez order.</li>
<li><strong>Make.com and KudiSMS</strong>: send our SMS and emails.</li>
<li><strong>Google Sheets</strong>: a read-only copy of the data for reports. Changing the sheet changes nothing in the system.</li>
</ul>`
    },
    {
      id: "deal",
      title: "A deal from start to finish",
      html: `
<ol>
<li><strong>Seller signs up.</strong> Name, business name, phone and email; ticks the Terms of Service and Seller Terms (required). Logs in with a code by SMS, no password. Adds a payout account in their own name and verifies their NIN.</li>
<li><strong>Seller creates a link.</strong> Item, condition, price, 1 to 4 photos, the buyer\u2019s delivery address, parcel weight, who pays delivery and fees, how many days to hand it to the courier (1 to 7), and when the link expires (1, 6, 24 or 72 hours). They confirm in a pop-up that the item is in the condition described, and that if it isn\u2019t they pay both delivery trips. The deal amount is limited to \u20A6300,000 during the pilot.</li>
<li><strong>Buyer, step 1: review.</strong> The buyer sees the item, photos, seller, address, every fee and the rules. They must tick \u201CI agree to the Terms of Service\u2026\u201D and accept a pop-up: changing their mind or refusing a correct item costs twice the delivery fee (the naira amount is shown). Both are saved with the order.</li>
<li><strong>Buyer, step 2: pay.</strong> Name, phone, email and a refund account in their own name (we check the name matches). They pay on Flutterwave\u2019s page.</li>
<li><strong>Payment secured.</strong> Both get an SMS. The buyer gets a 4-digit delivery PIN (SMS and tracking page). The seller must book pickup before the ship-by time.</li>
<li><strong>Seller books pickup.</strong> They write a packing note (serial number, colour, size, what is in the box). That note is evidence later.</li>
<li><strong>Delivery.</strong> The buyer checks the item at the door, then gives the rider the PIN. That marks it delivered.</li>
<li><strong>Inspection window</strong> (currently 24 hours) starts at delivery. The buyer can confirm everything is fine, or report a problem.</li>
<li><strong>Seller paid.</strong> When the buyer confirms or the window ends with no report, the payout goes to the seller\u2019s account. Flutterwave settles our collections the next working day, so payouts go out the working day after the buyer paid, at the earliest.</li>
</ol>
<p>If anyone asks \u201Cwhere is my money?\u201D, find the order and tell them which of these steps it is at.</p>`
    },
    {
      id: "statuses",
      title: "Order statuses",
      html: `
<table>
<tr><th>Status</th><th>Means</th><th>What to tell people</th></tr>
<tr><td>Awaiting payment</td><td>The buyer started paying but it hasn\u2019t been confirmed.</td><td>If they paid, it usually confirms within minutes. Checkouts not paid within about 2 hours are cancelled; the buyer can try again from the link if it hasn\u2019t expired.</td></tr>
<tr><td>Paid</td><td>Money held. Waiting for the seller to book pickup.</td><td>Seller: book pickup before the ship-by time. Buyer: the seller has until that time.</td></tr>
<tr><td>Shipping</td><td>With the courier.</td><td>Check the item before giving the PIN.</td></tr>
<tr><td>Delivered</td><td>PIN given; inspection window running.</td><td>Report any problem before the window ends, with photos.</td></tr>
<tr><td>Disputed</td><td>A problem was reported, or the seller missed the ship-by time, or the parcel was refused or returned. Money held.</td><td>TrustGap is reviewing. Collect their evidence for the admin.</td></tr>
<tr><td>Completed</td><td>The seller has been paid (or paid part, after a decision).</td><td>Payout timing as above.</td></tr>
<tr><td>Refunded</td><td>The buyer has been refunded (in full or in part).</td><td>Refunds go to the account they gave in step 2. Allow up to a working day after settlement.</td></tr>
<tr><td>Cancelled</td><td>Checkout never paid.</td><td>Nothing was taken.</td></tr>
<tr><td>Duplicate refunded</td><td>The deal was paid twice; the second payment was refunded in full.</td><td>The refund is automatic.</td></tr>
</table>`
    },
    {
      id: "fees",
      title: "Fees and the early-access code",
      html: `
<ul>
<li><strong>TrustGap fee:</strong> 1.5% of the item price, minimum \u20A6100, maximum \u20A63,000.</li>
<li><strong>Payment processing:</strong> Flutterwave\u2019s charge passed on at cost: 2% (capped at \u20A62,000) plus up to \u20A657.79 payout fee.</li>
<li>The two together are never more than \u20A65,058, however big the deal.</li>
<li><strong>Delivery:</strong> the courier\u2019s price for the route and weight, shown before the link is sent.</li>
<li><strong>Minimum price:</strong> the item price must be at least twice the delivery fee for that route, so if a buyer refuses a correct item, what they paid covers both delivery trips. Sellers see the minimum on the create-link screen.</li>
<li>For each of delivery and fees, the seller chooses who pays: the buyer, the seller, or half each. The buyer sees it all before paying.</li>
</ul>
<h3>Early-access code EARLYGAP</h3>
<ul>
<li>Removes the TrustGap fee (never the processing or delivery) from one deal.</li>
<li>A seller can use it on one link; a buyer on one order (it removes the buyer\u2019s share of the fee only).</li>
<li>It doesn\u2019t work if the seller pays the fee, or the link already has no TrustGap fee. It ends on 31 January 2027 or after 1,000 uses.</li>
</ul>`
    },
    {
      id: "problems",
      title: "Problems and disputes",
      html: `
<h3>How a problem is reported</h3>
<ul>
<li>The buyer uses <strong>Report a problem</strong> on their tracking page: before delivery, or within the inspection window after it.</li>
<li>For wrong, damaged, fake or not-as-described items, at least one photo is required (up to 2).</li>
<li>Disputes also open automatically when the seller misses the ship-by time, when the buyer refuses the parcel at the door, or when the courier returns it.</li>
</ul>
<h3>What you do</h3>
<ol>
<li>Contact both sides. Be neutral; don\u2019t take sides.</li>
<li>Ask for evidence: live photos taken with the <strong>TrustGap camera</strong> (on the buyer\u2019s tracking page, and on the seller\u2019s order page for a return), the chat where the item was described, and the seller\u2019s packing photos or video.</li>
<li>Write what you found in the task notes, with dates and who said what.</li>
<li>Mark the task done and tell the admin it is ready to decide.</li>
</ol>
<h3>How disputes are decided (by the admin, or by you with a \u201CDecide a dispute\u201D task)</h3>
<table>
<tr><th>Finding</th><th>Usual outcome</th></tr>
<tr><td>Seller at fault (wrong, fake, damaged, not as described, didn\u2019t ship)</td><td>Full refund to the buyer. The seller is charged both delivery trips, added to what they owe.</td></tr>
<tr><td>Buyer refused a correct item, or changed their mind</td><td>Refund minus twice the delivery fee (the buyer accepted this in step 1).</td></tr>
<tr><td>Claim not supported</td><td>The seller is paid as normal.</td></tr>
</table>
<p>A seller who owes a charge sees <strong>Pay now</strong> on their dashboard; otherwise it comes out of their next payout. They can\u2019t create new links while they owe money.</p>`
    },
    {
      id: "returns",
      title: "Returns",
      html: `
<p><strong>Every item goes back to the seller before any refund is paid, whatever it costs.</strong> No refund while the buyer still has the item. Nobody sends anything back on their own: TrustGap books every return.</p>
<h3>The return PIN</h3>
<p>It works like delivery in reverse. The seller gets a 4-digit return PIN by SMS and on their order page. When the item arrives, they check it, then give the rider the PIN. That is the record that they have it back, and it releases any refund that was waiting.</p>
<h3>Refused at the door</h3>
<ol>
<li>The buyer checks the item, keeps their delivery PIN and refuses. The rider records why.</li>
<li>The same rider takes it straight back. The seller gives the return PIN on arrival.</li>
<li>The admin reviews and decides who pays what. Money moves once the seller has it back and the decision is made.</li>
</ol>
<h3>Problem found during the inspection window</h3>
<ol>
<li>The buyer reports it with photos. The admin reviews and decides.</li>
<li>If the buyer is to be refunded, TrustGap books a courier to collect the item from the buyer. The buyer has <strong>3 days</strong> to hand it over, packed with everything that came with it.</li>
<li>The seller checks it and gives the rider the return PIN. The refund is then sent automatically.</li>
</ol>
<h3>When a return gets stuck</h3>
<ul>
<li><strong>Buyer not handing it over:</strong> remind them the refund waits for the item. After 3 days the admin page shows it as overdue; tell the admin.</li>
<li><strong>Seller not confirming:</strong> the seller can also tap \u201CI already have it back\u201D. If they say they have it but won\u2019t confirm, tell the admin, who can mark it received.</li>
<li><strong>Item that came back isn\u2019t right</strong> (swapped, damaged, parts missing): the seller <em>accepts</em> the parcel, but before giving the PIN taps \u201CIt came back, but it isn\u2019t right\u201D on their order page, describes the problem and takes photos with the TrustGap camera. The return is recorded as received (the item stays with the seller), the earlier decision is set aside, and a new dispute \u201CReturned item isn\u2019t what was delivered\u201D opens. The refund stays on hold. The seller then gives the rider the PIN so the courier can close the job. If the seller already gave the PIN, it\u2019s too late: the refund has gone, so they must check first.</li>
</ul>`
    },
    {
      id: "deciding",
      title: "Deciding a dispute",
      html: `
<p>Only when the admin has assigned you a <strong>Decide a dispute</strong> task for that order. The task\u2019s button opens the order with the evidence and the decision form. Your decision moves real money, so take your time.</p>
<h3>Before you decide</h3>
<ol>
<li><strong>Read the report</strong>: the category, the buyer\u2019s description and their photos (tap to open full size).</li>
<li><strong>Read the deal</strong>: the item description and condition, the seller\u2019s packing note, and the seller\u2019s condition pledge.</li>
<li><strong>Check delivery</strong>: when it was delivered, the courier\u2019s status, the rider\u2019s note if it was refused.</li>
<li><strong>Hear the seller</strong>: ask for their packing photos or video and the chat where they described the item. Give them a fair chance to answer (a few hours, or a day if not urgent).</li>
<li><strong>Write down what you found</strong> in the task notes before deciding.</li>
</ol>
<h3>Reading the photo checks</h3>
<p>Under each evidence photo the order page says how it was taken:</p>
<ul>
<li><strong>\u2713 Taken with the TrustGap camera</strong>, with a stamp code and time: taken live, for this order, at that moment. The same code is printed on the photo itself; check they match.</li>
<li><strong>\u26A0 Chosen from the phone</strong>: the person didn\u2019t use the camera (it may not work on their phone). Give it less weight, and ask for a live photo if it matters.</li>
<li><strong>\u26A0 No camera details</strong> or <strong>taken days earlier</strong>: possibly a screenshot, a forwarded picture or an old photo.</li>
<li><strong>\u26A0 Looks like the seller\u2019s listing photo</strong> or <strong>a photo already sent</strong>: someone may be reusing a picture instead of showing the real item. Treat as a red flag.</li>
</ul>
<p>A warning isn\u2019t proof of lying, and a clean photo isn\u2019t proof of the truth. Weigh the photos with the packing note, the courier\u2019s records and what both sides say.</p>
<h3>Choosing the outcome</h3>
<table>
<tr><th>What the evidence shows</th><th>Preset to use</th></tr>
<tr><td>Wrong item, fake, damaged, not as described, missing parts, or the seller didn\u2019t ship</td><td><em>Seller at fault</em>: full refund, seller charged both delivery trips.</td></tr>
<tr><td>The item matches the description and the buyer refused it or changed their mind</td><td><em>Buyer refused a correct item</em>: refund minus both delivery trips (the buyer accepted this before paying).</td></tr>
<tr><td>No real problem shown (e.g. normal wear, a size the buyer chose, no evidence)</td><td><em>Claim not supported</em>: the seller is paid as normal.</td></tr>
</table>
<p><strong>Returned item isn\u2019t what was delivered</strong> (opened by the seller): compare the seller\u2019s photos of what came back with the buyer\u2019s photos and the listing. If the buyer swapped or damaged it, refuse or reduce the refund; the seller may be paid even though they have the item, because it isn\u2019t the item they sent. If the seller\u2019s claim doesn\u2019t hold up, refund the buyer as originally decided.</p>
<p>The presets only fill in the amounts; you can adjust the deductions or the seller charge. The system refuses amounts that add up to more than the buyer paid. <strong>When the item goes back to the seller</strong> (refused at the door, or any refund after delivery), the seller can\u2019t also be paid: they get the item back instead. So on a door refusal there is no \u201Cpay the seller\u201D option: if the item was correct, use <em>Buyer refused a correct item</em>.</p>
<h3>The decision note</h3>
<p>Both sides get it by SMS, so write it plainly: what the evidence showed and why these amounts. Example: \u201CThe buyer\u2019s photos show a torn sole on the left shoe, and the seller\u2019s packing note doesn\u2019t mention damage. Full refund; the seller pays both delivery trips.\u201D Never write anything rude, personal or a guess.</p>
<h3>After you decide</h3>
<ul>
<li>If the buyer is refunded and had the item, a courier is booked to collect it, and the refund is sent once the seller has it back (see Returns).</li>
<li>Your task is marked done automatically, with the decision in its notes. The decision shows your name on the order.</li>
<li>A decision can\u2019t be undone. If you\u2019re unsure, add a note to the task and ask the admin instead of deciding.</li>
</ul>`
    },
    {
      id: "scripts",
      title: "Common questions and how to answer",
      html: `
<dl>
<dt>\u201CThe payment page says Tubalcain Ads Enterprise. Is this a scam?\u201D</dt>
<dd>No. Tubalcain Ads Enterprise is the registered business that runs TrustGap; Flutterwave shows the registered name. Only pay through the TrustGap link the seller sent.</dd>
<dt>\u201CI\u2019ve paid. Where is my item?\u201D</dt>
<dd>Check the order. If Paid: the seller has until the ship-by time to hand it to the courier, or the case comes to TrustGap. If Shipping: give the courier status.</dd>
<dt>\u201CI lost my delivery PIN.\u201D</dt>
<dd>It is in their SMS and on their tracking page (the link in their SMS). <strong>Never ask for the PIN and never read it out</strong>; only the buyer gives it to the rider.</dd>
<dt>\u201CThe rider wants the PIN before I see the item.\u201D</dt>
<dd>Don\u2019t give it. Check the item first. If the rider won\u2019t wait, refuse the delivery and contact us.</dd>
<dt>\u201CThe seller asked me to pay them directly to make it faster.\u201D</dt>
<dd>Don\u2019t. Outside the TrustGap link we can\u2019t help. Note the seller in your task so the admin can review them.</dd>
<dt>\u201CWhen will I get my refund?\u201D</dt>
<dd>After the decision and, if the item is coming back, once the seller has it. Then it goes out once Flutterwave has settled the original payment (the working day after it was paid, at the earliest), to the account they gave in step 2.</dd>
<dt>\u201CWhen will I get paid?\u201D (seller)</dt>
<dd>When the buyer confirms, or automatically when the inspection window ends with no problem reported. Then the next working day after settlement. Weekends and holidays add time.</dd>
<dt>\u201CCan I cancel?\u201D (buyer, before dispatch)</dt>
<dd>Take the details and pass to the admin. Once dispatched, they follow the refusal or return process instead.</dd>
</dl>`
    },
    {
      id: "rules",
      title: "Rules for the team",
      html: `
<ul>
<li><strong>Never ask for</strong> a card PIN, OTP, password, delivery PIN, return PIN or login code. Nobody at TrustGap ever needs them.</li>
<li><strong>Privacy:</strong> never give a buyer\u2019s address, phone or refund account to the seller, or the seller\u2019s details to the buyer, beyond what the order already shows them. Don\u2019t copy customer data into personal chats or notes.</li>
<li>Use the official TrustGap phone or WhatsApp and email, not your personal accounts.</li>
<li>Write everything important in the task notes: who you spoke to, when, what they said, what evidence you got. The notes are the record if a case is challenged.</li>
<li>Be polite and neutral. Don\u2019t argue, don\u2019t blame, don\u2019t promise outcomes.</li>
<li>Decide a dispute only with a \u201CDecide a dispute\u201D task for that order, and never one involving a friend, relative or a business you have a link to. If that happens, tell the admin and don\u2019t decide it.</li>
<li><strong>Pass to the admin straight away</strong> if: someone threatens legal action or the police; you suspect fraud or a fake identity; someone asks to change bank details; a payment looks missing or doubled; anyone is in danger; a journalist or regulator contacts you.</li>
<li>Marketing messages go only to people who ticked \u201CSend me TrustGap news and offers\u201D (the Marketing contacts tab). Never add anyone else.</li>
</ul>`
    },
    {
      id: "portal",
      title: "Using the team portal",
      html: `
<ol>
<li>Log in at <strong>/team/</strong> with your email and password. The first time, and after a reset, you must choose a new password (at least 10 characters).</li>
<li><strong>My tasks</strong> shows what the admin assigned you: high priority and soonest due first. Overdue tasks are marked.</li>
<li>Move a task to <em>In progress</em> when you start and <em>Done</em> when finished. Add notes as you go.</li>
<li>A <strong>Decide a dispute</strong> task has a button <em>Review evidence and decide</em>. See the section \u201CDeciding a dispute\u201D.</li>
<li>If a task is about an order, <strong>Open order</strong> shows its status, item, both sides\u2019 contact details, delivery, any dispute and return, and the timeline. It is read only, and you can only open orders your tasks are about.</li>
<li>Log out when you finish, especially on a shared device. Sessions end after 12 hours.</li>
</ol>
<p>Forgot your password? Ask the admin to reset it.</p>`
    },
    {
      id: "glossary",
      title: "Glossary",
      html: `
<dl>
<dt>Deal link</dt><dd>The payment link a seller creates for one item and one buyer.</dd>
<dt>Delivery PIN</dt><dd>The buyer\u2019s 4-digit code given to the rider after checking the item. Marks the order delivered.</dd>
<dt>Return PIN</dt><dd>The seller\u2019s 4-digit code given to the rider when a returned item reaches them.</dd>
<dt>Inspection window</dt><dd>Time after delivery (currently 24 hours) to report a hidden problem.</dd>
<dt>Ship-by time</dt><dd>The deadline for the seller to hand the item to the courier.</dd>
<dt>Packing note</dt><dd>The seller\u2019s description of what they packed, written when booking pickup.</dd>
<dt>Settlement</dt><dd>Flutterwave moving the buyer\u2019s payment into our account, the next working day.</dd>
<dt>Seller charge / debt</dt><dd>An amount a seller owes after losing a dispute. Paid on the dashboard or taken from the next payout.</dd>
<dt>Test mode</dt><dd>A demonstration setup where no real money moves. A yellow bar shows at the bottom of every page.</dd>
</dl>`
    }
  ]
};

// src/routes/team.js
async function requireStaff(ctx, request, { allowPasswordChange = false } = {}) {
  const session2 = await authenticate(ctx, request);
  const staff = session2?.staff_id && await first(ctx.env, "SELECT * FROM staff WHERE id = ? AND disabled_at IS NULL", session2.staff_id);
  if (!staff) throw new UserError("Please log in.", 401);
  if (staff.must_change_password && !allowPasswordChange) throw new UserError("Choose a new password first.", 403);
  return staff;
}
__name(requireStaff, "requireStaff");
async function requireAdmin2(ctx, request) {
  const session2 = await authenticate(ctx, request);
  if (!session2?.is_admin) throw new UserError("Admin login required.", 401);
}
__name(requireAdmin2, "requireAdmin");
function teamRoutes(r) {
  r.post("/api/team/login", ({ ctx, body }) => staffLogin(ctx, body));
  r.get("/api/team/me", async ({ ctx, request }) => ({ staff: meView(await requireStaff(ctx, request, { allowPasswordChange: true })) }));
  r.post("/api/team/password", async ({ ctx, request, body }) => ({ staff: await changeOwnPassword(ctx, await requireStaff(ctx, request, { allowPasswordChange: true }), body) }));
  r.get("/api/team/tasks", async ({ ctx, request }) => {
    const staff = await requireStaff(ctx, request);
    return { tasks: await tasksFor(ctx, staff.id), statuses: TASK_STATUSES };
  });
  r.post("/api/team/tasks/:id/status", async ({ ctx, request, params, body }) => ({ task: await setTaskStatus(ctx, await requireStaff(ctx, request), params.id, body.status) }));
  r.post("/api/team/tasks/:id/notes", async ({ ctx, request, params, body }) => ({ task: await staffNote(ctx, await requireStaff(ctx, request), params.id, body.body) }));
  r.get("/api/team/orders/:id", async ({ ctx, request, params }) => teamOrderView(ctx, await requireStaff(ctx, request), params.id));
  r.post("/api/team/disputes/:id/resolve", async ({ ctx, request, params, body }) => ({ ok: true, ...await teamResolveDispute(ctx, await requireStaff(ctx, request), params.id, body) }));
  r.get("/api/manual", async ({ ctx, request }) => {
    const session2 = await authenticate(ctx, request);
    if (!session2?.is_admin) await requireStaff(ctx, request);
    return { manual: MANUAL };
  });
  const admin = /* @__PURE__ */ __name((handler) => async (args) => {
    await requireAdmin2(args.ctx, args.request);
    return handler(args);
  }, "admin");
  r.get("/api/admin/team", admin(async ({ ctx }) => ({
    staff: await listStaff(ctx),
    tasks: await allTasks(ctx),
    roles: ROLES,
    statuses: TASK_STATUSES,
    priorities: PRIORITIES,
    kinds: TASK_KINDS
  })));
  r.post("/api/admin/team", admin(async ({ ctx, body }) => ({ staff: await createStaff(ctx, body) })));
  r.post("/api/admin/team/:id", admin(async ({ ctx, params, body }) => ({ staff: await updateStaff(ctx, params.id, body) })));
  r.post("/api/admin/tasks", admin(async ({ ctx, body }) => ({ task: await createTask(ctx, body) })));
  r.post("/api/admin/tasks/:id", admin(async ({ ctx, params, body }) => ({ task: await updateTask(ctx, params.id, body) })));
  r.post("/api/admin/tasks/:id/notes", admin(async ({ ctx, params, body }) => {
    const t = await first(ctx.env, "SELECT id FROM tasks WHERE id = ?", Number(params.id));
    if (!t) throw new UserError("Task not found.", 404);
    await addNote(ctx, t.id, "Admin", body.body);
    return { ok: true };
  }));
}
__name(teamRoutes, "teamRoutes");

// src/index.js
var router = new Router();
publicRoutes(router);
sellerRoutes(router);
riderRoutes(router);
adminRoutes(router);
teamRoutes(router);
var index_default = {
  async fetch(request, env, execCtx) {
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      const url = new URL(request.url);
      const match = router.match(request.method, url.pathname.replace(/\/{2,}/g, "/"));
      if (!match) throw new UserError("Not found", 404);
      if (url.pathname !== "/api/health") await ensureSchema(env);
      const ctx = url.pathname === "/api/health" ? { env } : createContext(env, execCtx);
      const body = request.method === "POST" ? await readBody(request) : {};
      const out = await match.handler({ ctx, request, params: match.params, body, url });
      res = out instanceof Response ? out : json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof UserError) {
        res = json({ error: err.message }, err.status);
      } else {
        const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
        console.error(`[error ${ref}]`, err);
        res = json({
          error: `Something went wrong on our side. Your money is safe. Please try again in a moment. (Ref ${ref})`,
          ...env.TEST_MODE !== "false" ? { detail: String(err?.message || err) } : {}
        }, 500);
      }
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  },
  // Cron trigger (wrangler.toml): timers every 5 minutes, Google Sheets copy every 15.
  async scheduled(event, env, execCtx) {
    await ensureSchema(env);
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
