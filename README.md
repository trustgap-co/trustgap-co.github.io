# TrustGap

Payment protection for Nigerian social-commerce deals (WhatsApp, Instagram, X).
The seller sends one link; the buyer reviews the deal and pays; TrustGap holds the money; the
rider delivers and the buyer's PIN confirms it; the seller is paid after a short inspection window.

> **Status: pilot build, test mode.** Payments, identity checks and delivery are simulated until
> each partner is connected. See [SETUP.md](SETUP.md).

## Stack

| Part | Tool |
|---|---|
| Website | Static HTML/JS in `docs/`, hosted on **GitHub Pages** |
| Server, timers | **Cloudflare Worker** in `worker/` (cron every 5 minutes) |
| Database | **Cloudflare D1** (source of truth), copied read-only to **Google Sheets** every 15 minutes |
| Seller identity | **Monnify** NIN verification (name and date-of-birth match, 3 attempts) |
| SMS and email | **Make.com** webhook → **KudiSMS** / email |
| Payments | **Flutterwave** Collect-and-Transfer: collect into the wallet, pay sellers with the Transfers API (gated until custody is approved) |
| Delivery | **Fez** (stub) — manual signed rider links meanwhile |

## How a deal flows

1. **Seller signs up with an SMS code** (no passwords), verifies a payout account in their own
   name, and verifies their identity with their NIN.
2. **Seller creates a link**: item, condition, price, private pickup address, the buyer's delivery
   area (sets the delivery fee), ship-within days, who pays delivery and the fee, and expiry time.
   Links can't be edited; a change makes a new link and retires the old one.
3. **Buyer, step 1 — review**: everything except the pickup address, the price breakdown and the
   protection rules. Confirming saves a hashed copy of exactly what they agreed to.
4. **Buyer, step 2 — details & pay**: name, phone, email, address, and a refund account that must
   be in the buyer's own name (encrypted, never shown to the seller). Then payment.
5. **Money held**: the buyer gets a 4-digit delivery PIN by SMS and on their tracking page.
6. **Seller books pickup** with a packing note (evidence). The rider updates the parcel and can
   only mark it delivered with the buyer's PIN.
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

## Code map

| Path | What it does |
|---|---|
| `worker/src/core/` | Business rules: sellers & login codes, deals, orders & money, timers |
| `worker/src/routes/` | API endpoints for the website, riders, admin and webhooks |
| `worker/src/providers/` | Flutterwave, Monnify, Fez, Make.com and Google Sheets connections (+ simulated versions) |
| `worker/src/lib/` | Money maths, delivery zones (**placeholder prices**), buyer rules, encryption, signed links |
| `worker/migrations/` | Database tables |
| `worker/test/` | 40 tests: full journeys, race conditions, pricing, payouts, Monnify, Make.com and Sheets |
| `docs/` | The website: `pay.html` (buyer link), `track.html`, `rider.html`, `seller/`, `admin/` |

## Run it locally

```bash
cd worker && npm install && cp .dev.vars.example .dev.vars
npm run db:migrate:local && npm run dev          # API → http://localhost:8787
cd ../docs && python3 -m http.server 8080        # site → http://localhost:8080
```

Test mode shows login codes on screen. Test data: NIN `11111111111` (born 1990-01-15) for
"Adebayo Oluwaseun John"; bank accounts `0000000001`–`0000000005` (see the hint on each form).
