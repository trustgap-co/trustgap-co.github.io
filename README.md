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
**Confirmations, in the person's face.** When the seller taps *Create link*, a pop-up asks "Is the
item in good condition, exactly as agreed with the buyer?" and shows the cost of a false description
(twice the delivery fee, in naira). When the buyer taps *Confirm & proceed to payment*, a pop-up shows
the cost of changing their mind after paying. Both are required, recorded word for word with the time,
shown to admin on the order page and copied to Google Sheets.

8. **Disputes**: the buyer reports the problem with up to 2 photos (required when the item is wrong,
   damaged, fake or not as described). Admin sees the photos on the order page straight away, with
   everything else, and decides the refund, payout and any charge to the seller. A seller who owes a
   charge sees **Pay ₦X now** on their dashboard (the payment page), or it's taken from their next payout.

9. **Returns**: a refund for an item that has to go back is only sent once the **seller has it back**.
   The seller gets a 4-digit **return PIN** (SMS and their order page) and gives it to the rider after
   checking the item, like the buyer's delivery PIN in reverse.
   - **Refused at the door**: the same rider takes it straight back and enters the seller's PIN.
   - **Problem found after delivery**: any refund admin decides books a new courier order from the
     buyer to the seller (with Fez, a new Fez order carrying the seller's PIN). Every item goes back,
     however cheap; there is no "refund and keep it". The decision is saved and the money waits.
   - **Refused at the door**: admin reviews it like any dispute and decides the split; the money
     moves once the seller has the item back and the decision is made.
   - Fallbacks: the seller can tap **I already have it back**; admin can **mark it received** or
     **cancel the return and decide again** (buyer never handed it over).
   - **Returned item isn't right**: the seller accepts the parcel but, before giving the PIN, reports
     it with stamped camera photos. The return is recorded as received, the earlier decision is set
     aside, a new dispute opens and the refund stays on hold.
   - **Photo evidence**: buyers' problem photos and sellers' returned-item photos are taken with the
     in-page **TrustGap camera**, stamped with the order number, time and a signed code. Uploads from
     the phone are still possible but flagged; the Worker also flags old or detail-less pictures and
     copies of the listing photos (picture fingerprints). Listing photos open the phone camera directly.

10. **Team portal and manual** (`/team/`): the admin adds team members on **Admin → Team** (name,
   email, phone, temporary password) and assigns them tasks, optionally about an order. Members log
   in with their own email and password (stored hashed; must change the temporary one first), see
   only their tasks, add notes, mark them done, and open the orders their tasks are about read only
   (no bank details or PINs). A **Decide a dispute** task lets the member decide that order's open
   dispute while the task is open (same rules, checks and return rule as the admin; recorded as
   `team:<name>` on the dispute and in the timeline; the task closes itself). The **team manual** (how TrustGap works end to end,
   statuses, fees, disputes, returns, answers to common questions, team rules) is served by the
   Worker only to the admin and signed-in members; it isn't a public page. Edit it in
   `worker/src/manual.js`.

11. **One case, every side's account; live pages**: the first report opens the case; the buyer, seller
   and rider (or Fez) add their side to it with photos instead of getting an error. Staff see all
   accounts side by side, who hasn't been heard from, and any disagreement about where the parcel is.
   Buyer, seller, rider, admin and team pages check for changes every 30 seconds while open, without
   redrawing over anything being typed.

12. **Security**: payment and NIN simulators refuse to work outside test mode; rate limits per
   connection and a daily SMS budget; the same login reply for every number; survey answers go through
   the Worker (the Make address is a secret); a Content Security Policy, referrer rule and frame guard in
   every page (`tools/security.py`); health details and risky-settings warnings only for the admin;
   `security.txt`.

13. **Suspending a seller** (Admin → Sellers, with a reason sent to them by SMS): no new links, their
   open links stop taking payments ("paused"), payouts are held and released on unsuspend, and buyers
   who already paid still get their items. Reason, date and history show on the Sellers page and Sheet.
14. **Records by date**: Orders, Disputes, Sellers, Messages and Ledger are grouped by day, with
   From/To filters, one-tap ranges (Today, Yesterday, Last 7 days, This month) and newest/oldest order;
   the ledger shows money in and out per day and totals for the chosen dates.
15. **No surprises, no silence**: the deal page shows the seller's record (since when, links created,
   completed orders, disputes decided against them) and "exactly what you are agreeing to"; buyer and
   seller order pages show the journey (Agreed → Payment secured → Preparing → Picked up → On the way →
   Delivered → Inspection → Released) with what happens next; every SMS ends with the next step; the
   PIN box has a doorstep checklist; a problem report gets a case reference (e.g. TG-7K2P9Q-C12) and an
   update promised within 24 hours. The team manual has the support standard.
16. **Price calculator for sellers** (`seller/price.html`): the exact price of a deal from both addresses
   and who pays what, using the same quote as link creation, a ready message to send the buyer, and
   "Create a payment link with these details", which opens the new-link form already filled in.
17. **Survey ad mode**: visitors from paid ads (utm_medium=paid… or an ad click ID) give their first name and
   WhatsApp number first (saved to the early-access list at once), then answer the survey or skip to
   their code; organic visitors keep optional contact, now with "Yes, send me my code" pre-selected.
   Every survey and early-access row records the mode, campaign, ad and click source (SETUP.md §10).
18. **Fez delivery codes**: on Fez orders Fez makes the delivery code and texts it at dispatch; TrustGap
   reads it (`delivery_OTP`) and shows it on the buyer's tracking page (or the seller's page for a
   return) instead of its own PIN. Your own riders keep TrustGap's PIN.
19. **Customer Relations Admin** (one at a time, added on Admin → Team): logs in at the team portal with
   password + texted code and works on the admin pages: decides any dispute, handles returns, can
   suspend (not unsuspend) sellers, manages customer relations members and tasks; no Ledger, payouts,
   debts, deal limits or settings; bank numbers masked. Every new dispute is texted to them and to
   `ADMIN_ALERT_PHONE`; decisions by anyone else are texted to the admin. Customer relations members
   decide only with a task and only up to `TEAM_DISPUTE_CAP_NAIRA` (200,000). Disputes have WhatsApp
   buyer/seller buttons.
20. **Guided tours** (`tour.js`, words in `tours.js`), never on the public pages. Sellers: dashboard,
   settings, new payment link, price calculator, order page. Buyers: deal link step 1 and step 2
   (step 2 follows straight on if they took the step 1 tour) and the tracking page. Always offered,
   never forced: an invitation, and a "Show me around" (?) button to replay. Back / Next / Skip; once finished or skipped, not offered again on
   that device. GA4 events: tour_offered, tour_started, tour_step, tour_completed, tour_skipped, tour_declined.
21. **Estimated delivery** (`lib/eta.js`): from Fez's timelines (same state 24-48 hours after pickup, up
   to 72 for remote areas; another state 3-7 working days). Shown on the seller's price box and
   calculator, the deal link, the tracking and order pages and the admin order page, and in the payment
   and picked-up SMS. It narrows as the order moves (quote, paid, booked, picked up) and notes the busy
   season until `ETA_BUSY_UNTIL`.
22. **Referrals** (`core/referrals.js`): every seller has an invite code and link (dashboard card with
   copy and WhatsApp share). New sellers who join with it get 2 free deals (no TrustGap fee); the
   inviter gets 1 free deal when the new seller's first order (item ₦10,000+) completes with no
   dispute; blocked for the same bank account, identity or phone, and capped at 10 a month. Free deals
   apply to the next link automatically (can be unticked) and expire after 90 days. 5 successful
   invites earn a TrustGap Ambassador badge shown to buyers. Buyers get a share card after a completed
   order (WhatsApp message and a status picture), with a link to join with the seller's invite.
   Admin → Sellers shows top referrers and each seller's referrals. Waived fees are recorded in the
   ledger (`fee_waived`, status `info`).
23. **Ledger segments** (Admin → Ledger): Money in, Paid out, TrustGap revenue, Costs, Giveaways,
   Other and Needs attention, each with its total for the chosen dates; tap one to list only its entries.
24. **App layout** for the seller, admin and team accounts and the buyer's deal pages: a slim top bar
   with the page name, a bottom tab bar on phones (seller: Home, New link, Prices, Settings; admin:
   Orders, Disputes, Sellers, Team and More), a side menu on computers, soft cards and finger-sized
   buttons. Sellers can add their account to the phone's home screen (`docs/manifest.webmanifest`;
   no offline caching, so updates show straight away). The seller's invite card lives in Settings and
   pops up on the dashboard once after each login.
25. **Deal safety check** (`docs/check.html`, in the site menu as "Is it safe?"): a free, no-login page
   in Pidgin (default) or English. Buyers or sellers answer quick yes/no questions, or paste the
   message they got, and see the red flags in the deal (never a verdict on a person), with suspicious
   words highlighted. Each result ends with a WhatsApp message asking the other side to use TrustGap
   and a picture to share on status. Nothing typed is saved or sent; analytics record only the result
   level (`safety_check_done`).
   Each result has its own voice: the level always follows the answers, but the headline, note,
   red-flag explanations, WhatsApp message and share line are picked fresh each time from
   `docs/assets/js/check-voices.js` (Pidgin and English), using every version before repeating one.
   The fun layer (`docs/assets/js/check-fun.js`): a character named after the main trick ("Aunty
   Today-Only", "Mr Screenshot Alert"), a Wahala Meter out of 10, the money kept when an amount is
   entered, notes on scam words in the pasted message, Red Flag Bingo, dare-a-friend share text and
   seasonal editions (ember months, Detty December, New Year). Jokes are about the trick, never the
   person; low-risk results get none; the share picture never shows what was typed or a name.
   Round three: a drawn cartoon face for every character (`check-art.js`, SVG on the page and canvas
   on share pictures), a buzz on red results (Android), confetti when someone asks for a TrustGap
   link, challenge links (`check.html?c=8.pressure.b` carries only the meter, the character and the
   side) and a weekly "most-met" line from the Worker (`check_stats`: a count per character per week,
   nothing else; `POST /api/check/met`, `GET /api/check/top`, shown once a character passes 10).
26. **Spot the Scam** (`docs/quiz.html`): a game of 10 made-up chats (from 16), Scam or Legit, the
   character behind each trick, a score picture and a dare link (`quiz.html?s=9`) that shows the
   friend's score. Pidgin first, English option.
   The chats live in `docs/assets/js/quiz-bank.js` (64: 50 scams, 14 legit). Each game takes 7 scams and
   3 legit, puts the legit ones apart (never first, never back to back), never shows the same character
   twice in a row and serves unseen chats first. Every answer says how to avoid the trick and which
   protection stops it (payment protection, tracked delivery, check before the code, verified sellers,
   bank app, refunds). The check and the quiz use the app layout (area "tool": Check / Spot the Scam /
   TrustGap tabs, slim collapsible footer).

**Fees**, shown as separate lines on every link: **TrustGap fee** 1.5% of the item price up to
₦200,000 and 1% above (minimum ₦100, maximum ₦15,000; the item price must be at least twice the
delivery fee), **Payment processing**, Flutterwave's charges passed on at cost (2%, capped at ₦2,000,
plus the ₦57.79 payout fee), and **Delivery**, TrustGap's own service: the courier's price plus a 15%
handling margin (at most ₦2,000; not added to your own riders' prices). The ledger keeps the courier's
cost (`delivery_cost`) and the margin (`delivery_margin`) apart. A **dispute fee** (4% of the item
price, ₦1,000 to ₦15,000, shown on the deal) is paid by whoever staff find at fault: from the buyer's
refund, or the seller's payout or debt; none when the courier or no one is at fault. Deals above
₦1,000,000 send the seller to support; the admin can raise one seller's limit on Admin → Sellers.
The seller and buyer agree who pays the fees and delivery (buyer, seller or 50/50). Seller payouts go out the next working
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
| `about.html` | The company and the team (photos in `docs/assets/images/team/`) |
| `survey.html`, `early-access.html` | Pre-launch campaign: buyer/seller survey and early-access sign-up, sent to Google Sheets through Make |
| `legal/` | 10 policy pages from the Legal Content Pack, marked “Draft: under legal review” |
| `pay.html`, `track.html` | The buyer's deal link and private tracking page |
| `seller/`, `admin/`, `rider.html` | Seller app, staff admin, courier-rider page |

**Search engines and AI assistants:** titles, link previews, structured data, `robots.txt`,
`sitemap.xml` and `llms.txt` are set up. After editing a page, run `python3 tools/seo.py` (SETUP.md §11).

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
| `worker/test/` | 79 tests: full journeys, race conditions, pricing, payouts, Monnify, Fez, Make.com and Sheets |
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
