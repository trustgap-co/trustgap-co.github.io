# Setting up TrustGap

Everything here works on free plans. Do the steps in order. You need Node.js 22+ on your computer.

```
GitHub Pages (docs/)  ──calls──▶  Cloudflare Worker (worker/)  ──▶  D1 database (the real records)
   the website                     the server + timers               └─▶ Google Sheets (read-only copy, every 15 min)
     │                                   │
     └─▶ GA4 + Meta Pixel                ├─▶ Flutterwave (payments)   ├─▶ Monnify (seller NIN checks)
         (after cookie consent)          ├─▶ Make.com webhook ─▶ KudiSMS (SMS) + email
                                         └─▶ Fez Delivery (or manual rider links until Fez is switched on)
```

Steps 1–7 set up the server and partners; steps 8–9 the website's content and analytics.

## 1. Cloudflare Worker and D1 database (from the Cloudflare dashboard)

The same way as CEA: create the Worker, paste the code, set the keys. The code is ready-made in
`worker/dashboard/worker.js`: the whole Worker in **one file**. You don't need the D1 console:
the Worker creates its database tables by itself the first time it runs.

**a. Create the database**
Cloudflare dashboard → **Storage & Databases → D1 SQL Database → Create**. Name it `trustgap`.
Leave it empty.

**b. Create the Worker**
1. **Workers & Pages → Create → Create Worker**. Name it `trustgap-api` → **Deploy** (the
   "Hello World" code is fine for now).
2. **Edit code** → select everything in the editor, delete it, paste **all** of
   `worker/dashboard/worker.js` → **Deploy**.

**c. Connect the database to the Worker**
**trustgap-api → Settings → Bindings → Add → D1 database**: Variable name `DB` (exactly, in
capitals), database `trustgap` → **Deploy/Save**.

**d. Add the settings:** **Settings → Variables and Secrets → Add**:

| Name | Type | Value |
|---|---|---|
| `APP_SECRET` | **Secret** | a long random string (50+ characters). **Save a copy in a password manager** |
| `ADMIN_PASSWORD` | **Secret** | a long password only you know (for `/admin/`) |
| `TEST_MODE` | Text | `true` (until you go live) |
| `SITE_URL` | Text | `https://trustgap-co.github.io` |
| `ALLOWED_ORIGINS` | Text | `https://trustgap-co.github.io` |
| `API_URL` | Text | your Worker's address, e.g. `https://trustgap-api.<you>.workers.dev` (shown on the Worker's page) |
| `PAYMENT_PROVIDER` | Text | `mock` (→ `flutterwave` later, step 6) |
| `IDENTITY_PROVIDER` | Text | `mock` (→ `monnify` later, step 5) |
| `LOGISTICS_PROVIDER` | Text | `manual` (→ `fez` later, step 7) |

Everything else (fee 1.5% capped at ₦3,000, processing 2% capped at ₦2,000, inspection 24h, …) has sensible defaults; add a variable
only if you want to change one (the names are listed in `worker/wrangler.toml`). Later keys
(Flutterwave, Monnify, Make.com, Google) are added the same way, always as **Secret**.

To make a random `APP_SECRET` without a terminal: a password manager's generator (50+ characters,
letters and numbers) is fine. `APP_SECRET` encrypts buyers' refund account numbers and delivery
PINs and signs rider links: **never change it after launch**, or those become unreadable.

**e. Turn on the timers:** **Settings → Triggers → Cron Triggers → Add**: `*/5 * * * *`
(every 5 minutes). This expires links, releases payments after inspection, sends payouts and
retries SMS. Google Sheets is copied on every third run.

**f. Check it works:** open `https://trustgap-api.<you>.workers.dev/api/health` in your browser.
You should see `{"ok":true,"database":"connected","settings":"ok"}`. If `settings` says something
else (a missing key, a mistyped provider name, a locked live key), it tells you exactly what to fix. The first visit also creates the tables
(D1 → trustgap → Tables then lists 12). If it says something else, the message tells you what to fix.

**g. Tell the website where the Worker is:** `docs/assets/js/config.js` already points to
`https://trustgap-api.trustgap-co.workers.dev`. If your Worker's address is different, change it there
**and** in the `preconnect` line near the top of each page (search the `docs/` folder for
`trustgap-api.trustgap-co.workers.dev` and replace every match). Commit.

**Updating the Worker later:** when the code changes, a new `worker/dashboard/worker.js` is
generated (`npm run dashboard-files` in `worker/`). Paste it into **Edit code** again and Deploy.
Your settings, secrets, database and cron trigger stay as they are. Database changes that come with
new code (files in `worker/migrations/`) are applied by the Worker automatically on its next request.

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

Every 15 minutes the Worker rewrites tabs **Summary, Orders, Sellers, Marketing contacts, Returns, Debt payments,
Disputes, Ledger** (it only touches those tabs, so the survey tabs from §10 can live in the same sheet).
- **Orders** includes when the seller confirmed the item's condition and when the buyer accepted the
  change-of-mind notice (the exact wording is kept in the database: admin order page), and when the
  buyer ticked "I agree to the TrustGap Terms of Service" in step 1.
- **Sellers** includes when each seller accepted the Terms of Service and Seller Terms at sign-up, and
  which version. Both checkboxes are required (nobody can sign up or pay without ticking), start
  unticked, and are checked again by the Worker. **When you change the legal pages**, change
  `TOS_VERSION` in `worker/src/lib/terms.js` and redeploy, so new acceptances record the new version.
- **Marketing contacts** lists sellers and buyers who ticked "Send me TrustGap news and offers" (seller
  sign-up, buyer step 2, or the seller's Settings): name, phone, email, when they opted in. Use only
  this tab for newsletters and promotions; people who didn't tick the box must not get marketing. If
  someone replies STOP, untick it for them (sellers can do it themselves in Settings).
- **Debt payments** lists sellers paying a dispute charge from their dashboard.
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

- **Pricing** covers Flutterwave's costs: "TrustGap fee" (1.5%, maximum ₦3,000) plus "Payment processing"
  (Flutterwave's 2% on collections, which Flutterwave caps at ₦2,000 per payment, and the ₦53.75 + VAT
  payout fee, passed on at cost). The two fees together never exceed ₦5,058 per deal. Change
  `FEE_CAP_NAIRA`, `PROCESSING_PERCENT`, `PROCESSING_CAP_NAIRA` or `PAYOUT_FEE_NAIRA` (Text variables in
  Cloudflare) if you change your cap or your merchant agreement differs; `0` means no cap.
  `MIN_PRICE_DELIVERY_MULTIPLE` (default 2): the item price must be at least that many times the delivery
  fee, so a refused correct item's two delivery trips are always covered by what the buyer paid (`0` = off).
  **Check the ₦2,000 cap against your own Flutterwave pricing** (Dashboard, Settings, Fees): if your account
  has no cap, set `PROCESSING_CAP_NAIRA` to `0`, or buyers will be charged less than Flutterwave takes.
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
   **Checkout branding:** the Flutterwave account is in Tubalcain Ads Enterprise's name, but the
   payment page shows **TrustGap**, the item name with "Payment secured under TrustGap deal rules", and
   TrustGap's logo (sent as `customizations` with every payment). The logo is the website's icon
   (`docs/assets/favicon.png`); to use a different image, add a Text variable `CHECKOUT_LOGO_URL` with the
   full https address of a square PNG or JPG. Flutterwave may still show your registered business name in
   small print on some screens.
   **Test accounts:** with a test key (`FLWSECK_TEST-…`), Flutterwave only recognises its own test
   bank accounts, not real ones, and not the `0000000001`–`0000000005` numbers (those belong to TrustGap's
   built-in simulator, `PAYMENT_PROVIDER = "mock"`). Use **Access Bank, 0690000032** (or 0690000031 to
   0690000040) for the buyer's refund account and the seller's payout account. The name typed must match
   the name Flutterwave has for that test account; if it doesn't, the error message shows that name.
   The forms show this tip automatically in Flutterwave test mode.
4. A live key (`FLWSECK-…`) is **locked** unless you also set `ALLOW_LIVE_PAYMENTS = "true"`: the site
   keeps working, but paying, account checks and payouts stop with a message saying live payments are
   locked, and `/api/health` shows it. Before unlocking, also set `TEST_MODE = "false"` (live money with
   the test banner showing would confuse people). Flutterwave was clear
   that **TrustGap, not Flutterwave, is the custodian of the money in the wallet**, so do this only
   after a Nigerian fintech lawyer has advised on safeguarding and segregation of those funds.

**Sellers paying what they owe.** When admin charges a seller in a dispute (e.g. twice the delivery
fee), the seller's dashboard shows **Pay ₦X now**. It opens the same Flutterwave payment page buyers
use (reference `TGD-…`), and the balance clears as soon as Flutterwave confirms the payment (through the
same redirect and webhook, nothing extra to set up). Otherwise the amount is still taken from their next
payout, and they can't create new links until it's cleared. Flutterwave's 2% on that payment is
TrustGap's cost.

Still to ask Flutterwave (their integrations team offered a walkthrough):
- Is the 2% on local NGN collections capped?
- NGN transfer limits per transfer and per day.
- The reserve / chargeback terms in your merchant agreement (chargebacks are TrustGap's liability).
- Can a transfer that **failed** be retried with the same reference, or must it be new? (The app
  assumes new.)

## 7. Fez Delivery

Until Fez is switched on, `LOGISTICS_PROVIDER = "manual"`: delivery is priced from a simple table
(₦3,000 within the same state, ₦6,000 to another state, + 7.5% VAT; change with
`DELIVERY_SAME_STATE_NAIRA` / `DELIVERY_OTHER_STATE_NAIRA`), and when a seller books pickup the admin
order page shows a **rider link** (signed, 14 days) for your own rider, who enters the buyer's PIN.

With Fez (`worker/src/providers/logistics/fez.js`, built from Fez's API docs):

| When | Fez endpoint | What happens |
|---|---|---|
| Seller fills in the link (live preview) and creates it | `POST /order/cost` | Delivery price for pickup state → buyer's state, by weight; TrustGap uses `totalCost` (cost + VAT) and fixes it on the link |
| Seller marks the item packed | `POST /order` | Creates the Fez order: buyer's address/state/name/phone, `uniqueID` = TrustGap order ref, weight, fragile, pickup address/state, the seller as sender (`thirdparty`), and the buyer's **delivery PIN as `CustToken`** |
| Fez status changes | your webhook → `GET /orders/{orderNo}` | The webhook is only a hint; the status is re-read from Fez. Picked-Up / Dispatched update tracking, **Delivered** starts the buyer's inspection window, **Returned** opens a dispute |
| Every 5 minutes | `GET /orders/{orderNo}` | Catches up any missed webhook |

Steps:
1. After onboarding and KYC, Fez gives you admin credentials (a user ID like `G-1234-5678` and a
   password). Fez recommends changing the generated password first (in their portal, or their
   `/user/changePassword` endpoint). Then add as **Secret**: `FEZ_USER_ID` and `FEZ_PASSWORD`.
   The Worker logs in at `POST /user/authenticate`, uses the returned token and your organisation's
   `secret-key` from the same reply, and logs in again before the token expires (or straight away
   if Fez ever refuses it). `FEZ_SECRET_KEY` is only needed if you want to override that key.
2. Add **Text** `FEZ_API_BASE`: `https://apisandbox.fezdelivery.co/v1` for testing; ask Fez for the
   live address when you go live.
3. Set `LOGISTICS_PROVIDER` to `fez` and deploy.
4. **Admin → Orders → Register Fez webhook** (tells Fez to send updates to
   `https://<your-worker>/webhooks/fez`).
5. **Fund your Fez business wallet.** Fez charges each order to it; orders show "Pending Payment"
   at Fez until it's funded (you'll see that in the order's timeline).

Ask Fez to confirm: (a) their riders ask the recipient for the `CustToken` before handing over
the parcel, (b) that `expireToken` is Lagos time, (c) the exact webhook signature
(TrustGap checks HMAC-SHA256 of orderNo + status + timestamp with your secret key, but re-reads the
status from Fez either way), (d) charges for returns and failed deliveries, (e) for **returns**: TrustGap
books a new Fez order collected from the buyer and delivered to the seller, with the seller's return PIN
as `CustToken`; confirm their riders collect from a customer's home address and ask the seller for that
PIN. A parcel refused at the door goes back on the original Fez order, so there Fez's "Returned"
status counts as the seller having it back (Fez can't ask for the seller's PIN on that order).
Buyers have `RETURN_PICKUP_DAYS` (default 3) to hand a return over; after that the admin order page
shows it as overdue.

## 8. Website content: company details, photos and policies

**Uploading the website.** Everything for GitHub Pages is in `docs/`. If you update by hand
(GitHub → **Add file → Upload files**), upload the whole `docs/` folder so the new files go in too
(`analytics.js`, the `legal/` pages, the new marketing pages). Pages refresh within a minute or two.

**Company details: `docs/assets/js/site-info.js`.** Fill these in once and every page, the footer
and the policies update: legal name, RC number, registered and operating address, support /
privacy / complaints / compliance emails, support phone and hours, data protection officer,
effective and last-updated dates, minimum age, dispute and refund timeframes, delivery coverage and
governing law. Anything still in `[brackets]` shows on the site as a yellow highlight, so you can
see at a glance what's missing.

Two switches in the same file:
- `policiesApproved: true` removes the “Draft: under legal review” notice from the policy pages.
  Set it **only after your lawyer approves** the policies (`docs/legal/`). Lines written for the
  lawyer (e.g. “[LAWYER TO DRAFT THE SPECIFIC LIMITATION…]”) must be replaced before then.
- `partnerNamesApproved: true` shows “Payment powered by Flutterwave. Delivery coordinated with Fez
  Delivery.” on the home page. Set it only after **both** partners approve that wording in writing.

**Policy pages: `docs/legal/`.** The 10 pages from the Legal Content Pack (terms, privacy, data
protection, delivery, returns/refunds/disputes, fees and payments, acceptable use, cookies, seller
terms, partners) plus an index. The wording is exactly the pack's. Your lawyer's edits can be made
directly in those HTML files. `legal/cookies.html` also has a cookie register listing exactly what
the site stores. Keep it up to date if you add tools.

**Photos: `docs/assets/images/`.** Add the files listed in that folder's `README.md`, using exactly
those names. All images are PNG: landscape 1200×900, shrunk at tinypng.com to under ~400 KB each, plus
`og-image.png` (1200×630) for link previews on WhatsApp/X. The browser-tab icon is
`docs/assets/favicon.png` (192×192). Until a photo is there, its spot shows a
labelled placeholder. Photos load only when they scroll into view, so they don't slow the first screen.

**Item photos (uploaded by sellers).** Sellers add 1 to 4 photos to every link; the buyer sees them
on step 1 before paying, and they stay with the order as evidence. Nothing to set up: the photos are
stored in your D1 database (the Worker creates the `deal_photos` table itself on its next request).
- The seller's phone shrinks each photo to a JPEG of at most 1280px (about 150–400 KB) before
  uploading, and the Worker removes hidden camera details such as GPS location. (Seller photos are
  JPEG, not PNG: a PNG photo is several MB and too large to store this way.)
- Photos of links that were never paid are deleted after 30 days. Paid deals keep theirs.
- **Buyers' problem photos** (up to 2 per report, required for a wrong, damaged, fake or
  not-as-described item) are stored the same way, in `dispute_photos`. They're private evidence:
  only admin (on the order page) and the buyer (on their tracking page) can open them, through
  signed links that stop working after 2 hours (reloading the page gives fresh ones). The seller
  doesn't see them.
- Storage: the D1 free plan allows a 500 MB database, roughly 1,000–2,000 paid deals with photos.
  When you get close (Cloudflare → D1 → trustgap shows the size), move to the
  Workers Paid plan ($5/month, 10 GB per database), or ask for the photos to be moved to Cloudflare R2.

## 9. Analytics: Google Analytics 4 and Meta Pixel

Full list of events and reports: **[TRACKING.md](TRACKING.md)**.

1. **GA4:** analytics.google.com → **Admin → Create → Property** → add a **Web** data stream for
   `https://trustgap-co.github.io`. Copy the **Measurement ID** (`G-…`).
2. **Meta Pixel:** business.facebook.com → **Events Manager → Connect data → Web → Meta Pixel**. Copy
   the **Pixel ID** (a long number). In the pixel's settings, turn off **Automatic advanced matching**.
3. Put both in `docs/assets/js/site-info.js`:

   ```js
   tracking: {
     ga4Id: 'G-AB12CD34EF',
     metaPixelId: '123456789012345',
     requireConsent: false,
   },
   ```

   Upload the file. While the placeholders (`G-XXXXXXXXXX`, `000000000000000`) are there, nothing
   loads.
4. **Check it:** open `https://trustgap-co.github.io/?debug_tracking=1` and click around. Events appear in the browser console and in **GA4 → Admin → DebugView** within seconds;
   use Meta's **Test events** tab or the Meta Pixel Helper extension for the pixel.
   `?debug_tracking=0` turns debugging off again.
5. **In GA4, once:** mark `early_access_signup`, `survey_complete`, `sign_up`, `deal_link_created`,
   `begin_checkout` and `purchase` as **key events**, and register the custom dimensions listed in TRACKING.md.
6. **In Meta:** before launch, use `Lead` (early-access sign-ups) as the ad optimisation event; after
   launch, `CompleteRegistration` (seller sign-ups) or `Purchase` (buyer payments).

How it behaves:
- **On by default:** with `requireConsent: false` (the current setting) GA4 and the Meta Pixel load
  on every visit, with no banner. Anyone can switch them off with **Cookie settings** in the footer
  (that choice is remembered on their phone). The cookie register in `legal/cookies.html` says this.
  **Ask your lawyer** whether Nigerian law (the NDPA and the NDPC's guidance) requires consent first
  for analytics and advertising cookies; if it does, set `requireConsent: true` and a banner will ask
  before anything loads.
- **Never tracked:** admin pages and the rider page.
- **Private links stay private:** the buyer's deal and tracking links contain a secret code (and
  the tracking page shows the delivery PIN). Before Google or Meta load, the code is swapped in the
  address bar for a short key that only works on that phone. Reload and bookmarks still work there;
  the SMS link works on any device.
- **No personal data is sent:** no names, phone numbers, emails, addresses, bank details, NINs or
  PINs. As a final check, quoted text, emails and long numbers are blanked out of every event.
- **Speed:** the trackers load last, after the page has finished and the phone is idle.
- **Purchases** are counted when the buyer lands on their tracking page after paying: once per
  order per device, with the order reference as the ID, so Meta can de-duplicate if you add
  server-side events later.

## 10. Pre-launch campaign: survey, early access, launch switch and early-access code

### a. Survey and early-access answers → Google Sheets (through Make)

The survey (`survey.html`) and the early-access form (`early-access.html`) send each response
straight from the visitor's browser to **one Make.com webhook**. The Worker isn't involved.

1. **Google Sheet:** create a sheet called e.g. `TrustGap leads` with two tabs, **Survey** and
   **Early access**. Put these headings in row 1 (any order; Make maps them by name):
   - **Survey:** `submitted_at_lagos, source, medium, campaign, role, b_frequency, b_channels,
     b_channels_other, b_scammed, b_what_happened, b_what_happened_other, b_hesitation, b_payment,
     b_payment_other, b_protection, b_likely, b_trust, b_trust_other, s_category, s_category_other,
     s_channels, s_channels_other, s_orders, s_payment, s_payment_other, s_problem, s_problem_other,
     s_lost_money, s_would_use, s_would_use_other, s_stop, s_stop_other, s_fee, state, age_range,
     under_18, safer_change, early_access, name, business_name, phone, email, channel, seller_pilot,
     research_contact, promo_code, seconds_taken, device, survey_version, submission_id`
   - **Early access:** `submitted_at_lagos, source, medium, campaign, role, name, business_name,
     category, phone, email, channel, state, age_range, consent, promo_code, device, submission_id`
2. **Make:** create a new scenario. Add **Webhooks → Custom webhook**, create a webhook (e.g.
   "TrustGap leads") and copy its URL (it starts with `https://hook.` and ends in `.make.com/…`).
3. Paste the URL into `docs/assets/js/site-info.js` → `leadsWebhookUrl`, and upload the file.
   (Until you do, both forms show a yellow "not connected" warning and save nothing.)
4. In Make, click **Redetermine data structure**, then fill in the survey once on the live site
   (use "Yes, contact me"), and the early-access form once. Make now knows every field.
5. After the webhook, add a **Router** with two routes:
   - Route 1, filter **form = survey** → **Google Sheets → Add a row** to the **Survey** tab, mapping
     each column to the field of the same name.
   - Route 2, filter **form = early_access** → **Add a row** to the **Early access** tab.
   - Optional: on route 2 (and on route 1 when `early_access = yes`), send a WhatsApp/SMS through your
     KudiSMS module: "Welcome to TrustGap early access! Your code {{promo_code}} removes the TrustGap
     fee from your first deal after launch."
6. Turn the scenario **on** (immediately).

What's sent, and what isn't:
- Every completed survey is sent, including anonymous ones ("No, submit anonymously") and those from
  under-18s. Under-18s are never asked for contact details (`under_18 = yes`); change
  `allowUnder18Contact` in site-info.js only if your lawyer approves (children's data needs a
  parent's consent under the NDPA).
- No NIN, bank details, card PIN, OTP or passwords are ever asked for.
- `source` comes from the link people arrived on: add `?source=instagram`, `?source=whatsapp`,
  `?source=tiktok` etc. to every link you post (or utm_source / utm_medium / utm_campaign). It's
  remembered from the first page they land on.
- `submission_id` is unique per response: if a slow connection ever sends one twice, delete the
  duplicate row.
- If the phone is offline, the response waits on the phone and is sent when it's back online.
- The webhook address is visible in the website's code, so someone could post junk to it. The forms
  have a hidden spam trap, and you can delete junk rows; if it becomes a problem, add a Make filter
  or move the forms behind the Worker.
- Survey answers are personal data: Make and Google act for TrustGap here. Keep the sheet private,
  share it only with the people who need it, and delete responses when the research is done.

### b. The launch switch

In `docs/assets/js/site-info.js`:

```js
launched: false,
launchDate: 'Monday, 23 November 2026',
```

- **`launched: false` (now):** the home page shows **Get early access** and **Take the 2-minute
  survey**, a "Launching Monday, 23 November 2026" badge, and a "Have you ever been scammed while
  shopping online?" section with buyer and seller survey links. The header button is **Get early
  access** and the menu shows **Take the survey**. Every "Start a protected deal" / seller sign-up
  button on the site is replaced by **Get early access**. The seller pages, deal links and admin
  still work (for your testing) if you go to them directly.
- **`launched: true` (launch day):** change that one word, upload site-info.js, and the deal buttons,
  "Seller login" and "Sell with payment secured" come back everywhere; the campaign section and
  early-access buttons disappear. The survey and early-access pages stay online at their addresses.

On the page, anything marked `class="when-live"` shows only after launch, and `class="when-prelaunch"`
only before. Use those classes if you add more buttons.

### c. The early-access code (EARLYGAP)

**What it gives:** no TrustGap fee (1.5%) on one deal. TrustGap only ever gives away its own fee:
Flutterwave's processing and the courier are still paid in full, so a deal with the code earns
TrustGap ₦0, never less.

- **Sellers** enter it in **Early-access code** when creating a link. The live preview shows the fee
  crossed out. The link has no TrustGap fee at all, whoever was paying it (buyer, seller or both).
  Once per seller account. If that link expires or is cancelled unpaid, they can use it again.
- **Buyers** tap **Have an early-access code?** on step 1 of a link. Their share of the TrustGap fee is
  removed from their total (all of it if they pay the fee, half on a 50/50 deal). The seller's payout
  doesn't change. Once per buyer phone number. If the seller pays the whole fee, or the link already
  has no fee, there's nothing for a buyer's code to remove, and they're told to keep it.
- The discount is part of the terms the buyer accepts, and shows on their tracking page.

**Settings** (Worker → Settings → Variables, all optional; defaults shown):

| Name | Default | Meaning |
|---|---|---|
| `PROMO_CODE` | `EARLYGAP` | The code (not case-sensitive). Set it to empty to switch the offer off. |
| `PROMO_ENDS` | `2027-01-31` | Last day it works (Lagos time). |
| `PROMO_MAX_USES` | `1000` | Total links + orders it can be used on, to cap what it can cost. |

If you change the code or the end date, change `earlyAccessCode` / `earlyAccessCodeEnds` in
site-info.js too (that's what the thank-you screens show).

It's one shared code, so it can be passed around. That's limited by once-per-seller and
once-per-phone, the end date and the cap, and the most it can cost is your fee on those deals.

### d. Launch-day steps

1. `launched: true` in site-info.js; upload.
2. Worker: `TEST_MODE = "false"` and the live provider settings (see the checklist below).
3. Check the home page, a real test deal (with and without the code), and the survey still saving.

## 11. Search engines and AI assistants (SEO and AEO)

Already built in:
- Every public page has a clear title and description, a canonical address, link-preview tags
  (WhatsApp, X, LinkedIn, with `docs/assets/images/og-image.png`) and structured data that tells
  Google, Bing and AI assistants what TrustGap is: the organisation, the service and fees, the FAQ
  answers, the how-it-works steps and the team (About page).
- `docs/robots.txt` welcomes search engines and AI crawlers (ChatGPT, Claude, Perplexity, Google)
  and keeps them out of the app pages; `docs/sitemap.xml` lists the public pages.
- `docs/llms.txt` is a plain-text briefing for AI assistants: what TrustGap is, fees, how disputes
  work, key pages. Update it when facts change (e.g. on launch day).
- App pages (pay, track, seller, admin, rider) are marked "don't index". They still carry
  link-preview tags, so a deal link shared on WhatsApp shows the TrustGap image with "Your TrustGap
  payment link". WhatsApp keeps a preview for each address it has already seen, so only links shared
  after this change show it.

**After editing a page's title, description, FAQ or team, run** `python3 tools/seo.py` from the repo
root. It refreshes the tags, structured data and sitemap (safe to run any number of times).

Do once, after the site is live on GitHub:
1. **Google Search Console** (search.google.com/search-console): add a *URL prefix* property for
   `https://trustgap-co.github.io/`, verify it (download the HTML verification file into `docs/` and
   upload it), then **Sitemaps → add `sitemap.xml`**.
2. **Bing Webmaster Tools** (bing.com/webmasters): sign in and **import from Google Search Console**.
   This matters for AI: ChatGPT's web search relies largely on Bing's index.
3. Test a page in Google's **Rich Results Test** (search.google.com/test/rich-results) to see the
   FAQ and organisation data recognised.
4. When TrustGap has Instagram, X, TikTok or LinkedIn pages, tell me (or add them to `ORG['sameAs']` in
   `tools/seo.py`) so search engines connect them to the site.

What makes AI assistants actually recommend TrustGap over time is other websites mentioning it:
press articles, business directories, blog posts, Nairaland threads, partner pages and reviews.
The site now makes it easy for them to understand TrustGap; mentions elsewhere make them trust it.

## 12. Team members, tasks and the manual

- **Add a team member:** Admin → **Team** → *Add a team member*: name, email (their login), phone (for
  task SMS) and a temporary password of at least 10 characters. Tell them the password by phone or in
  person. They log in at `https://<your-site>/team/` and must choose their own password first.
- **Assign work:** *Assign a task* with a title, details, an optional order reference (lets them open
  that order, read only), a due date and priority. They get an SMS and email through Make (the
  event is `task_assigned`; add it to your Make scenario's SMS route if you filter by event).
- **Forgotten password / someone leaves:** *Reset password* (signs them out; they set a new one) or
  *Turn off* (signs them out and blocks login). Accounts are never deleted, so task history stays.
- **Deciding disputes while you're away:** assign a task with **Type: Decide a dispute** and the order
  reference (the order must have an open dispute). Until that task is done, the member can see the
  evidence and decide that one dispute with the same presets, checks and return rule as you. The
  decision moves money exactly like yours, shows "Decision by <name> (team)" on the order, and closes
  the task with the amounts in its notes.
- **What members can't do:** decide any other dispute, change orders, see bank or refund accounts,
  PINs, or orders their tasks aren't about. Admin pages refuse their login.
- **The manual** is at `/team/manual.html` (Admin → Manual). The page itself is public, but its text
  comes from the Worker only after login, so nobody else can read it. To change it, edit
  `worker/src/manual.js`, change `updated`, and redeploy the Worker.

### Photo evidence

- Buyers' problem photos and sellers' "returned item isn't right" photos use the **TrustGap camera**: the page
  opens the phone camera (the browser asks for camera permission once) and stamps each photo with the
  order number, time and a code signed by the Worker (valid 30 minutes). If the camera can't open,
  people can still choose a photo, but it's marked as not taken with the camera.
- On the order page, each evidence photo shows ✓ (stamped, checks out) or ⚠ warnings: chosen from the
  phone, no camera details, taken long before the report, a copy of a listing photo, or a photo already
  sent. Warnings help whoever decides; they don't block anything.
- Camera access only works on `https://` (GitHub Pages is) or `localhost`.

## 13. Going live checklist

- [ ] Lawyer advises on holding customer funds (Flutterwave confirmed TrustGap is the custodian)
- [ ] Lawyer reviews the policy pages in `docs/legal/` and the buyer rules in `worker/src/lib/terms.js`;
      then set `policiesApproved: true`
- [ ] Company details filled in `site-info.js` (no yellow `[placeholders]` left anywhere on the site)
- [ ] Flutterwave and Fez approve how they're named before setting `partnerNamesApproved: true`
- [ ] Photos added to `docs/assets/images/`
- [ ] GA4 and Meta Pixel IDs set; events checked with `?debug_tracking=1`; lawyer confirms
      whether analytics may be on by default (`requireConsent`)
- [ ] Make webhook URL in site-info.js; a test survey and early-access row arrive in the sheet
- [ ] `launched: true` in site-info.js on launch day
- [ ] Merchant agreement checked: reserves, chargebacks, prohibited items, whether the 2% is capped
- [ ] Monnify wallet funded for NIN checks (₦60 each)
- [ ] `TEST_MODE = "false"` (stops showing login codes on screen and the test banner)
- [ ] Real `APP_SECRET` and `ADMIN_PASSWORD` set as secrets, with a backup copy of `APP_SECRET`
- [ ] KudiSMS sender ID approved, transactional route working, a real code received on a DND number
- [ ] Fez live keys set, webhook registered, Fez wallet funded, and a test parcel delivered end to end
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
npm test                                      # (in worker/) 79 tests, no Cloudflare account needed
```

Admin locally: http://localhost:8080/admin/ with the password from `.dev.vars`.
Analytics locally: add `?debug_tracking=1` to see every event in the browser console (no IDs needed).
