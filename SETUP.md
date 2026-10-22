# Setting up TrustGap

Everything here works on free plans. Do the steps in order. You need Node.js 22+ on your computer.

```
GitHub Pages (docs/)  ──calls──▶  Cloudflare Worker (worker/)  ──▶  D1 database (the real records)
   the website                     the server + timers               └─▶ Google Sheets (read-only copy, every 15 min)
                                         │
                                         ├─▶ Flutterwave (payments)   ├─▶ VerifyMe (seller ID checks)
                                         ├─▶ Make.com webhook ─▶ KudiSMS (SMS) + email
                                         └─▶ Fez (delivery — not connected yet; manual rider links meanwhile)
```

## 1. Cloudflare Worker and D1 database

```bash
cd worker
npm install
npx wrangler login                      # opens your browser
npx wrangler d1 create trustgap        # prints a database_id
```

Paste the `database_id` into `worker/wrangler.toml`, then:

```bash
npm run db:migrate                      # creates the tables in Cloudflare
npx wrangler secret put APP_SECRET      # paste a long random string (50+ characters)
npx wrangler secret put ADMIN_PASSWORD  # a long password only you know
npm run deploy                          # prints your Worker URL, e.g. https://trustgap-api.<you>.workers.dev
```

Then put that URL in two places:
- `worker/wrangler.toml` → `API_URL`
- `docs/assets/js/config.js` → `API_URL`

and run `npm run deploy` again.

> **APP_SECRET** encrypts buyers' refund account numbers and delivery PINs and signs rider links.
> Never change it after launch, or those become unreadable. Keep a copy somewhere safe.

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

## 5. VerifyMe (seller identity)

Until you have a key, `IDENTITY_PROVIDER = "mock"` accepts test NIN `11111111111` (DOB 1990-01-15).

When you get API access:
1. Check `worker/src/providers/identity/verifyme.js` against VerifyMe's current docs. Their docs
   site couldn't be reached while this was written, so the endpoint and field names need checking.
2. `npx wrangler secret put VERIFYME_SECRET_KEY`
3. Set `IDENTITY_PROVIDER = "verifyme"` in `wrangler.toml` and deploy.

## 6. Flutterwave (when they reply)

1. Ask Flutterwave to confirm **in writing** that holding funds and paying out after delivery is
   allowed on your account, and which product to use (see the earlier feasibility notes).
2. Test keys first: `npx wrangler secret put FLW_SECRET_KEY` (a `FLWSECK_TEST-…` key),
   `npx wrangler secret put FLW_WEBHOOK_HASH` (any random string, also entered in the Flutterwave
   dashboard), and set the webhook URL to `https://<your-worker>/webhooks/flutterwave`.
3. Set `PAYMENT_PROVIDER = "flutterwave"` and deploy. Run a few test orders.
4. Live keys are refused unless you also set `ALLOW_LIVE_PAYMENTS = "true"`. Do that only after
   the lawyer and Flutterwave (or your bank partner) have approved how the money is held.

If Flutterwave says no, another provider or bank only needs a new file in
`worker/src/providers/payments/` with the same functions (`listBanks`, `resolveAccount`,
`createCheckout`, `verify`, `parseWebhook`, `transfer`).

## 7. Fez (when they reply)

Until then, `LOGISTICS_PROVIDER = "manual"`: when a seller books pickup, the admin order page shows
a **rider link** (signed, expires in 14 days) to send to your rider on WhatsApp. The rider updates the
parcel and enters the buyer's PIN on it. For Fez, fill in `worker/src/providers/logistics/fez.js`.

## 8. Going live checklist

- [ ] Lawyer and payment partner approve the custody model in writing
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
