# Setting up TrustGap

Everything here works on free plans. Do the steps in order. You need Node.js 22+ on your computer.

```
GitHub Pages (docs/)  ──calls──▶  Cloudflare Worker (worker/)  ──▶  D1 database (the real records)
   the website                     the server + timers               └─▶ Google Sheets (read-only copy, every 15 min)
                                         │
                                         ├─▶ Flutterwave (payments)   ├─▶ Monnify (seller NIN checks)
                                         ├─▶ Make.com webhook ─▶ KudiSMS (SMS) + email
                                         └─▶ Fez (delivery — not connected yet; manual rider links meanwhile)
```

## 1. Cloudflare Worker and D1 database (from the Cloudflare dashboard)

The same way as CEA: create the Worker, paste the code, set the keys. Two ready-made files are
in the repo for this:

- `worker/dashboard/worker.js` — the whole Worker in **one file**, to paste into "Edit code"
- `worker/dashboard/schema.sql` — all the database tables, to paste into the D1 console

**a. Create the database**
1. Cloudflare dashboard → **Storage & Databases → D1 SQL Database → Create**. Name it `trustgap`.
2. Open it → **Console**. Paste everything from `worker/dashboard/schema.sql` → **Execute**.
   (If the console complains about running several statements, paste and run one
   `CREATE TABLE …;` / `ALTER TABLE …;` block at a time, top to bottom.)

**b. Create the Worker**
1. **Workers & Pages → Create → Create Worker**. Name it `trustgap-api` → **Deploy** (the
   "Hello World" code is fine for now).
2. **Edit code** → select everything in the editor, delete it, paste **all** of
   `worker/dashboard/worker.js` → **Deploy**.

**c. Connect the database to the Worker**
**trustgap-api → Settings → Bindings → Add → D1 database**: Variable name `DB` (exactly, in
capitals), database `trustgap` → **Deploy/Save**.

**d. Add the settings** — **Settings → Variables and Secrets → Add**:

| Name | Type | Value |
|---|---|---|
| `APP_SECRET` | **Secret** | a long random string (50+ characters) — **save a copy in a password manager** |
| `ADMIN_PASSWORD` | **Secret** | a long password only you know (for `/admin/`) |
| `TEST_MODE` | Text | `true` (until you go live) |
| `SITE_URL` | Text | `https://trustgap-co.github.io` |
| `ALLOWED_ORIGINS` | Text | `https://trustgap-co.github.io` |
| `API_URL` | Text | your Worker's address, e.g. `https://trustgap-api.<you>.workers.dev` (shown on the Worker's page) |
| `PAYMENT_PROVIDER` | Text | `mock` (→ `flutterwave` later, step 6) |
| `IDENTITY_PROVIDER` | Text | `mock` (→ `monnify` later, step 5) |
| `LOGISTICS_PROVIDER` | Text | `manual` |

Everything else (fee 1.5%, processing 2%, inspection 24h, …) has sensible defaults; add a variable
only if you want to change one (the names are listed in `worker/wrangler.toml`). Later keys
(Flutterwave, Monnify, Make.com, Google) are added the same way, always as **Secret**.

To make a random `APP_SECRET` without a terminal: a password manager's generator (50+ characters,
letters and numbers) is fine. `APP_SECRET` encrypts buyers' refund account numbers and delivery
PINs and signs rider links: **never change it after launch**, or those become unreadable.

**e. Turn on the timers** — **Settings → Triggers → Cron Triggers → Add**: `*/5 * * * *`
(every 5 minutes). This expires links, releases payments after inspection, sends payouts and
retries SMS. Google Sheets is copied on every third run.

**f. Check it works** — open `https://trustgap-api.<you>.workers.dev/api/health` in your browser.
You should see `{"ok":true}`.

**g. Tell the website where the Worker is** — in GitHub, edit `docs/assets/js/config.js` and replace
`https://trustgap-api.YOUR-SUBDOMAIN.workers.dev` with your Worker's address. Commit.

**Updating the Worker later:** when the code changes, a new `worker/dashboard/worker.js` is
generated (`npm run dashboard-files` in `worker/`). Paste it into **Edit code** again and Deploy.
Your settings, secrets, database and cron trigger stay as they are. If a change adds a new file in
`worker/migrations/`, also run that file's SQL once in the D1 console.

### Alternative: the terminal (wrangler)

If you prefer commands, `worker/wrangler.toml` holds the same settings: put your D1 `database_id`
in it, then from `worker/`: `npm install`, `npx wrangler login`, `npm run db:migrate`,
`npx wrangler secret put APP_SECRET`, `npx wrangler secret put ADMIN_PASSWORD`, `npm run deploy`.
Pick one way and stick to it: a terminal deploy replaces the text variables you set in the
dashboard with the ones in `wrangler.toml` (secrets are kept).

> **Dashboard users, for the steps below:** wherever a step says `npx wrangler secret put NAME`,
> add `NAME` under **Settings → Variables and Secrets** with type **Secret**. Wherever it says to set
> something in `wrangler.toml` and deploy, add or change that **Text** variable there instead.

## 2. Website on GitHub Pages

In the GitHub repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs`**.
The site appears at `https://trustgap-co.github.io/`.

`worker/wrangler.toml` already has `SITE_URL = https://trustgap-co.github.io` and
`ALLOWED_ORIGINS = https://trustgap-co.github.io`. If you later buy a domain, change both (and
`API_URL`) and redeploy.

## 3. Make.com → KudiSMS (SMS) and email

The Worker sends every message to one Make webhook as JSON:

```json
{
  "id": 12,
  "event": "login_code",
  "to_phone": "+2348031234567",
  "to_phone_intl": "2348031234567",
  "to_email": "bayo@example.com",
  "sms": "Your TrustGap code is 482913. It expires in 10 minutes. Never share it with anyone.",
  "email_subject": "Your TrustGap login code",
  "email_body": "…same text…",
  "order_ref": "TG-TV5W8X",
  "sent_at": "2026-10-22T09:15:00.000Z"
}
```

Build the scenario:
1. **Webhooks → Custom webhook**. Copy its URL.
2. **KudiSMS** (or an **HTTP → Make a request** module calling KudiSMS's send-SMS API) with recipient
   `to_phone_intl`, message `sms`, and your approved sender ID.
   Use KudiSMS's **corporate/transactional route** for codes and PINs. Normal routes don't reach
   numbers on the DND list.
3. Optional: a **Router** with an email module (Gmail, MailerLite, …) when `to_email` is not empty.
4. Turn the scenario **on** (scheduling: immediately).

Then tell the Worker:

```bash
npx wrangler secret put MAKE_WEBHOOK_URL      # the webhook URL from step 1
npx wrangler secret put MAKE_WEBHOOK_SECRET   # any random string (optional but recommended)
```

With a secret set, each request carries `X-TrustGap-Signature` = base64url(HMAC-SHA256(secret, raw body)).
You can check it in Make before sending, so nobody else can use your webhook to send SMS.
If Make is down, messages are retried every 5 minutes (up to 5 times). See **Admin → Messages**.

Without `MAKE_WEBHOOK_URL`, messages are only saved (status "logged"), and in test mode login codes
appear on screen.

## 4. Google Sheets copy

1. Create a Google Sheet. Copy its ID from the URL (`/spreadsheets/d/<THIS PART>/edit`).
2. In Google Cloud Console: create a project → enable **Google Sheets API** → create a
   **service account** → **Keys → Add key → JSON**.
3. Share the Sheet with the service account's email (Editor).
4. Set the secrets (values from the JSON file):

```bash
npx wrangler secret put GOOGLE_SHEET_ID
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL   # "client_email"
npx wrangler secret put GOOGLE_PRIVATE_KEY             # "private_key", including the BEGIN/END lines
```

Every 15 minutes the Worker rewrites tabs **Summary, Orders, Sellers, Disputes, Ledger**.
It is read-only: edits in the sheet are overwritten. Bank account numbers, PINs, full addresses and
ID numbers are never copied. **Admin → Orders → Copy to Google Sheets now** forces a sync.

## 5. Monnify (seller NIN checks)

Sellers verify with their **NIN only**. Until you add keys, `IDENTITY_PROVIDER = "mock"` accepts
test NIN `11111111111` (date of birth 1990-01-15).

1. In the Monnify dashboard, copy your **API key** and **secret key** (live, not sandbox: Monnify's
   NIN check only works on the live environment).
2. Top up your Monnify wallet. Each successful NIN check costs **₦60** and checks fail if the
   balance is too low.
3. Set the secrets and switch the provider:

```bash
npx wrangler secret put MONNIFY_API_KEY
npx wrangler secret put MONNIFY_SECRET_KEY
```

   then set `IDENTITY_PROVIDER = "monnify"` in `worker/wrangler.toml` and run `npm run deploy`.

How it works: the Worker logs in to Monnify (`POST /api/v1/auth/login`), sends the NIN to
`POST /api/v1/vas/nin-verification`, and compares the returned name with the seller's account name
and the returned date of birth with what they typed. Only the last 4 digits of the NIN are stored.
Each seller gets **3 attempts** (so a typo costs ₦60, not unlimited money); Monnify outages don't
count. A seller who runs out can be verified by hand: **Admin → Sellers → Mark ID verified**.

## 6. Flutterwave (Collect-and-Transfer)

Flutterwave confirmed this model: TrustGap is the **primary merchant** (not an escrow provider).
Buyer payments settle into TrustGap's Flutterwave wallet the next working day (T+1), and TrustGap
pays sellers with the **Transfers API** once delivery is confirmed. The app already works this way:

- **Pricing** covers Flutterwave's costs: "TrustGap fee" (1.5%, no cap) plus "Payment processing"
  (Flutterwave's 2% on collections and the ₦53.75 + VAT payout fee, passed on at cost). Change
  `PROCESSING_PERCENT` / `PAYOUT_FEE_NAIRA` in `wrangler.toml` if your merchant agreement differs.
- **Payouts wait for settlement**: a payout is scheduled for the next working day after the buyer
  paid (`SETTLEMENT_HOURS`), so it never fails for lack of wallet balance.
- **No double payouts**: every transfer uses a fixed reference (`TGT-<ledger id>-<attempt>`) as
  Flutterwave's idempotency key. A transfer whose outcome is unknown is retried with the same
  reference; only a confirmed failure gets a new one (3 attempts, then **Admin → Ledger** shows it as
  "needs_attention").
- **Results** come from Flutterwave's `transfer.completed` webhook, always re-checked with
  `GET /transfers/:id`, and a timer re-checks any transfer still unconfirmed after 30 minutes.

Steps:
1. Test keys first: `npx wrangler secret put FLW_SECRET_KEY` (a `FLWSECK_TEST-…` key) and
   `npx wrangler secret put FLW_WEBHOOK_HASH` (any random string; enter the same one in the
   Flutterwave dashboard as the webhook secret hash).
2. In the Flutterwave dashboard set the webhook URL to `https://<your-worker>/webhooks/flutterwave`
   and enable payment **and** transfer events.
3. Set `PAYMENT_PROVIDER = "flutterwave"` and deploy. Run test orders through to payout and refund.
4. Live keys are refused unless you also set `ALLOW_LIVE_PAYMENTS = "true"`. Flutterwave was clear
   that **TrustGap, not Flutterwave, is the custodian of the money in the wallet**, so do this only
   after a Nigerian fintech lawyer has advised on safeguarding and segregation of those funds.

Still to ask Flutterwave (their integrations team offered a walkthrough):
- Is the 2% on local NGN collections capped?
- NGN transfer limits per transfer and per day.
- The reserve / chargeback terms in your merchant agreement (chargebacks are TrustGap's liability).
- Can a transfer that **failed** be retried with the same reference, or must it be new? (The app
  assumes new.)

## 7. Fez (when they reply)

Until then, `LOGISTICS_PROVIDER = "manual"`: when a seller books pickup, the admin order page shows
a **rider link** (signed, expires in 14 days) to send to your rider on WhatsApp. The rider updates the
parcel and enters the buyer's PIN on it. For Fez, fill in `worker/src/providers/logistics/fez.js`.

## 8. Going live checklist

- [ ] Lawyer advises on holding customer funds (Flutterwave confirmed TrustGap is the custodian)
- [ ] Merchant agreement checked: reserves, chargebacks, prohibited items, whether the 2% is capped
- [ ] Monnify wallet funded for NIN checks (₦60 each)
- [ ] `TEST_MODE = "false"` (stops showing login codes on screen and the test banner)
- [ ] Real `APP_SECRET` and `ADMIN_PASSWORD` set as secrets, with a backup copy of `APP_SECRET`
- [ ] KudiSMS sender ID approved, transactional route working, a real code received on a DND number
- [ ] Delivery prices in `worker/src/lib/zones.js` replaced with your courier's written rate card
- [ ] Rules in `worker/src/lib/terms.js` reviewed by a lawyer; privacy notice published
- [ ] Turn on D1 Time Travel / regular exports for backups
- [ ] Consider Workers Paid ($5/month) once volume grows. The free plan allows 10ms CPU per request

## Local development

```bash
cd worker
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev                                   # API on http://localhost:8787
# in another terminal:
cd docs && python3 -m http.server 8080        # site on http://localhost:8080
npm test                                      # (in worker/) 31 tests, no Cloudflare account needed
```

Admin locally: http://localhost:8080/admin/ with the password from `.dev.vars`.
