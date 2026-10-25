# TrustGap

Payment protection for Nigerian social-commerce deals (WhatsApp, Instagram, X).
**Agree. Secure. Deliver. Inspect. Release.** The seller sends one link; the buyer reviews the deal
and pays; the payment is secured under the deal rules; the courier delivers and the buyer's PIN
confirms it; the seller is paid after a short inspection window.

Live site: https://trustgap-co.github.io/

> **Status: pilot build, test mode.** Payments, identity checks and delivery are simulated until
> each partner is connected. The policy pages are **drafts under legal review**. See
> [SETUP.md](SETUP.md) for setup and [TRACKING.md](TRACKING.md) for analytics.

## Stack

| Part | Tool |
|---|---|
| Website | Static HTML/JS in `docs/`, hosted on **GitHub Pages** (no build step) |
| Analytics | **Google Analytics 4** + **Meta Pixel**, behind a cookie-consent banner |
| Server, timers | **Cloudflare Worker** in `worker/` (cron every 5 minutes) |
| Database | **Cloudflare D1** (source of truth), copied read-only to **Google Sheets** every 15 minutes |
| Seller identity | **Monnify** NIN verification (name and date-of-birth match, 3 attempts) |
| SMS and email | **Make.com** webhook → **KudiSMS** / email |
| Payments | **Flutterwave** Collect-and-Transfer: collect into the wallet, pay sellers with the Transfers API (gated until custody is approved) |
| Delivery | **Fez** API: delivery priced per buyer state, pickups booked with the buyer's PIN, status by webhook (manual rider links as an alternative) |

## How a deal flows

1. **Seller signs up with an SMS code** (no passwords), verifies a payout account in their own
   name, and verifies their identity with their NIN.
2. **Seller creates a link**: item, 1 to 4 photos of the actual item, condition, price, private pickup address and state, the
   buyer's delivery address and state (from the chat), parcel weight, fragile or not, ship-within
   days, who pays delivery and who pays the fees (buyer, seller or 50/50), and expiry time. A live
   preview shows the courier's delivery fee, both fees, what the buyer pays and what the seller
   receives before the link is created. Links can't be edited; a change makes a new link.
3. **Buyer, step 1: review**: the item and its photos, the delivery address (read-only), the exact price
   breakdown and the protection rules. Confirming saves a hashed copy of exactly what they agreed to.
   A wrong detail means asking the seller for a corrected link.
4. **Buyer, step 2: details & pay**: name, phone, email, and a refund account in the buyer's own
   name (encrypted, never shown to the seller). Then payment of exactly the total from step 1.
5. **Money held**: the buyer gets a 4-digit delivery PIN by SMS and on their tracking page.
6. **Seller books pickup** with a packing note (evidence). TrustGap creates the Fez order with the
   buyer's PIN as Fez's confirmation token; Fez status updates (webhook + a 5-minute check) move the
   order to delivered. With manual riders, the rider can only mark it delivered with the buyer's PIN.
7. **Inspection window** (24h): buyer confirms or reports a problem; otherwise the seller is paid
   automatically.
8. **Disputes**: admin sees everything and decides the refund, payout and any charge to the seller.

**Fees**, shown as two lines on every link: **TrustGap fee** 1.5% of the item price (minimum ₦100,
no cap) and **Payment processing**, Flutterwave's charges passed on at cost. About 3.9% in total;
the seller and buyer agree who pays (buyer, seller or 50/50). Seller payouts go out the next working
day after the buyer paid, once Flutterwave has settled the money.

Timers also expire links, cancel abandoned checkouts, refund buyers when sellers miss the ship-by
date, and retry failed SMS. Every money step is atomic, so a webhook, a redirect and a timer
acting at the same moment can't pay twice.

## The website

| Page | What it is |
|---|---|
| `index.html` | Home: animated hero (Agree → Secure → Deliver → Inspect → Release), why TrustGap, how it works, buyers, sellers, example deal, delivery, fees, FAQ |
| `how.html` | The full process: what “payment secured” means, every order status, the inspection window, what happens when things go wrong, returns, payouts |
| `buyers.html`, `sellers.html` | One page for each side; sellers get a payout calculator |
| `fees.html` | Fees, calculator (same maths as the Worker), who pays and what is refundable |
| `faq.html` | Questions, including safety and privacy |
| `survey.html`, `early-access.html` | Pre-launch campaign: buyer/seller survey and early-access sign-up, sent to Google Sheets through Make |
| `legal/` | 10 policy pages from the Legal Content Pack, marked “Draft: under legal review” |
| `pay.html`, `track.html` | The buyer's deal link and private tracking page |
| `seller/`, `admin/`, `rider.html` | Seller app, staff admin, courier-rider page |

**Launch switch:** `launched: false` in `docs/assets/js/site-info.js` makes the site promote early
access and the survey; set it to `true` on launch day and the deal buttons come back (SETUP.md §10).

**Early-access code** `EARLYGAP`: no TrustGap fee on one deal per seller and one order per buyer phone.

Things you edit by hand:
- **`docs/assets/js/site-info.js`**: company name, RC number, addresses, emails, phone, dates and
  response times (shown on every page and in the policies; anything still in `[brackets]` is
  highlighted in yellow), the GA4 and Meta Pixel IDs, `policiesApproved` (removes the draft notices
  once your lawyer approves) and `partnerNamesApproved` (shows the Flutterwave/Fez line once both
  approve).
- **`docs/assets/images/`**: photos. The file names and sizes are listed in that folder's README;
  until a photo is added, the page shows a labelled placeholder.
- **`docs/assets/js/config.js`**: the Worker's address.

Copy guardrails (from the trust report): don't say “escrow”, “guaranteed”, “verified seller”,
“100% fraud-proof” or “Flutterwave holds your money”. Say “payment secured under the deal rules”.

## Code map

| Path | What it does |
|---|---|
| `worker/src/core/` | Business rules: sellers & login codes, deals, orders & money, timers |
| `worker/src/routes/` | API endpoints for the website, riders, admin and webhooks |
| `worker/src/providers/` | Flutterwave, Monnify, Fez, Make.com and Google Sheets connections (+ simulated versions) |
| `worker/src/lib/` | Money maths, Nigerian states, buyer rules, encryption, signed links, automatic database setup |
| `worker/migrations/` | Database tables (item photos are stored in D1 too, in `deal_photos`) |
| `worker/test/` | 72 tests: full journeys, race conditions, pricing, payouts, Monnify, Fez, Make.com and Sheets |
| `worker/dashboard/worker.js` | The whole Worker in one file, to paste into Cloudflare's **Edit code** |
| `docs/assets/js/core.js` | Shared website code: API calls, safe HTML, header/footer, image slots, private-link handling |
| `docs/assets/js/analytics.js` | GA4 + Meta Pixel, cookie banner, automatic and funnel events, speed measurements |
| `docs/assets/js/pages/` | One script per page |
| `docs/assets/styles.css` | All styles (brand: navy `#0B1B3D`, white `#F4F7FC`, Roboto) |

## Run it locally

```bash
cd worker && npm install && cp .dev.vars.example .dev.vars
npm run db:migrate:local && npm run dev          # API → http://localhost:8787
cd ../docs && python3 -m http.server 8080        # site → http://localhost:8080
```

Add `?debug_tracking=1` to any page address to see every analytics event in the browser console.
Test mode shows login codes on screen. Test data: NIN `11111111111` (born 1990-01-15) for
"Adebayo Oluwaseun John"; bank accounts `0000000001`–`0000000005` (see the hint on each form).
