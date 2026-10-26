# Website tracking (GA4 + Meta Pixel)

All tracking code is in `docs/assets/js/analytics.js`. You only edit `docs/assets/js/site-info.js`.

## 1. Add your IDs

In `docs/assets/js/site-info.js` → `tracking`:

```js
tracking: {
  ga4Id: 'G-XXXXXXXXXX',          // GA4 → Admin → Data streams → Web → Measurement ID
  metaPixelId: '000000000000000', // Meta Events Manager → Data sources → your pixel's ID
  requireConsent: false,          // on by default; true = a banner asks first
},
```

While the placeholders are there, nothing loads. You can add one ID without the other.

## 2. Check it works

Open any page with `?debug_tracking=1` at the end of the address (e.g. `https://trustgap-co.github.io/?debug_tracking=1`).
Every event is printed in the browser console, and appears live in **GA4 → Admin → DebugView**.
Turn it off with `?debug_tracking=0`. For Meta, use the **Meta Pixel Helper** Chrome extension or
**Events Manager → Test events**.

## 3. Set up GA4 (once)

1. **Admin → Events → mark as key event:** `sign_up`, `deal_link_created`, `begin_checkout`, `purchase`.
2. **Admin → Custom definitions → Create custom dimension** (scope "Event") for the parameters you
   want to filter reports by: `flow`, `form_id`, `error_message`, `link_location`, `link_text`,
   `section`, `percent`, `question`, `delivery_payer`, `fee_payer`, `delivery_state`, `pickup_state`,
   `order_status`, `dispute_category`, `metric_name`, `metric_rating`. Add `metric_value`,
   `buyer_total` and `seller_payout` as custom **metrics**.
3. **Explore → Funnel exploration**, two funnels worth saving:
   - Sellers: `page_view` (signup page) → `otp_requested` → `sign_up` → `payout_account_added` →
     `identity_verified` → `deal_link_created`
   - Buyers: `view_item` → `begin_checkout` → `add_payment_info` → `purchase`

## 4. Set up Meta (once)

Events Manager → your pixel → **Settings**: turn off "Automatic advanced matching" (TrustGap does
not send names, phones or emails). Use `CompleteRegistration` (seller sign-ups) or `Purchase`
(buyer payments) as the optimisation event for adverts.

## Events

Sent to GA4 always; the **Meta** column shows what Meta receives.

### Buyers
| Event | When | Main details | Meta |
|---|---|---|---|
| `view_item` | Buyer opens a deal link | value, item name & condition, states, who pays, seller verified | ViewContent |
| `deal_unavailable` | Link is paid / expired / cancelled / replaced | deal_status | – |
| `begin_checkout` | "The item, address and price are right. Continue" | same as view_item | InitiateCheckout |
| `deal_review_again` | Buyer goes back to review the deal | – | – |
| `buyer_penalty_notice` | Buyer answers the change-of-mind pop-up | acknowledged (true / false) | – |
| `add_payment_info` | Details accepted, going to the payment page | same as view_item | AddPaymentInfo |
| `purchase` | First time the tracking page shows a paid order (once per order per device) | transaction_id (order ref), value, shipping, trustgap_fee | Purchase (event ID = order ref) |
| `payment_incomplete` | Tracking page with payment not completed | order_status | – |
| `payment_retry` | "Try payment again" | transaction_id, value | – |
| `order_status_view` | Every tracking-page view | order_status, delivery_status, has_dispute | – |
| `delivery_accepted` | Buyer releases payment early | transaction_id | – |
| `dispute_opened` | Buyer reports a problem | transaction_id, dispute_category | – |

### Sellers
| Event | When | Main details | Meta |
|---|---|---|---|
| `otp_requested` | Login code requested | flow = signup / login | SignupStarted (signup only) |
| `sign_up` / `login` | Code accepted | method = sms | CompleteRegistration (sign_up) |
| `payout_account_added` | Payout account verified | first_time | – |
| `identity_verified` | NIN check passed | method = nin | – |
| `deal_form_started` | First typing in "New payment link" | is_revision | – |
| `deal_link_created` | Link created | value, condition, quantity, states, who pays, expiry, is_revision | DealLinkCreated |
| `share` | Link copied or "Share on WhatsApp" | method = copy / whatsapp | – |
| `pickup_booked` | Seller books the courier | – | – |
| `seller_condition_confirm` | Seller answers the condition pop-up | confirmed (true / false) | – |
| `debt_payment_started`, `debt_payment_result` | Seller taps Pay now / comes back from the payment page | value, result | – |

### Pre-launch campaign
| Event | When | Main details | Meta |
|---|---|---|---|
| `survey_start` | Role chosen (or arrived on a buyer/seller survey link) | role | – |
| `survey_step` | Each question answered | question, step | – |
| `survey_complete` | Survey sent | role, early_access, source, under_18 | SurveyCompleted |
| `early_access_signup` | Early-access sign-up (form, or "Yes, contact me" in the survey) | role, via | **Lead** |
| `early_access_under_18` | Under-18 tried to join early access (nothing saved) | – | – |
| `promo_applied` | A seller's or buyer's early-access code is accepted | side, discount | – |

Survey answers and contact details are never sent to Google or Meta; they go only to your Google
Sheet through Make. `begin_checkout` carries `coupon` when a buyer used the code.

### Everyone (automatic)
| Event | When | Main details |
|---|---|---|
| `page_view` | Every page (GA4 built-in; Meta PageView) | page address without private tokens |
| `cta_click`, `nav_click`, `footer_click`, `link_click`, `button_click` | Clicks | link_text (public pages only), link_url, link_location |
| `outbound_click`, `contact_click` | Links to other sites / email & phone links | link_domain / method (Meta: Contact) |
| `section_view` | A page section is seen | section, section_index |
| `scroll_depth` | 25 / 50 / 75 / 100 % of the page | percent |
| `faq_open`, `details_open` | A question or panel is opened | question |
| `hero_step_click` | Home animation step tapped | step |
| `fee_calculator_used` | Calculator used (after a pause in typing) | item_price, delivery_fee, who pays, buyer_total, seller_payout (Meta: FeeCalculatorUsed) |
| `form_success`, `form_error` | Any form submitted | form_id, error_message, error_status |
| `exception` | A script error on the page | description |
| `web_vitals` | Real loading speed from visitors' phones | metric_name (LCP, FCP, CLS, INP, TTFB), metric_value, metric_rating |

## Privacy rules built in

- Trackers are on by default (`requireConsent: false`); anyone can switch them off with "Cookie
  settings" in the footer, and that choice is remembered. Set `requireConsent: true` to ask first.
- Never tracked: admin pages and the rider page.
- The secret code in buyers' links (`pay.html?d=…`, `track.html?t=…`) is swapped for a short local
  key before Google or Meta load, so they never see it. The page still works when reloaded or
  bookmarked on the same phone; the SMS link works anywhere.
- No names, phone numbers, emails, addresses, bank details, NINs or PINs are sent. As a final
  safety net, quoted text, email addresses and long numbers are blanked out of every event.
- On seller and buyer pages, link texts and headings aren't recorded (they can contain buyers' names).
- Meta's automatic button and form scraping is switched off.

## Speed changes (same release)

- The Roboto font no longer blocks the page from showing. Android phones use their built-in Roboto
  until the download arrives, so text doesn't jump.
- Space is reserved for the header, and the test-mode bar sits at the bottom, so pages don't shift
  down as they load (layout shift on the home page went from 0.21 to 0.03).
- Photos load only when they scroll near the screen. Long pages render lower sections on demand.
- The home-page animation pauses when it's off screen or the tab is hidden.
- App pages fetch their scripts in parallel and connect to the API early. Site settings are kept for
  10 minutes per tab, so the pages after the first don't wait for them.
- The trackers themselves load only after the page has finished loading and the phone is idle.

Measured on a throttled mid-range phone (4× slower CPU, slow 4G):

| Page | Largest content shown (before → after) | Layout shift (before → after) |
|---|---|---|
| Home | 0.90s → 0.77s | 0.21 → 0.03 |
| How it works | 0.72s → 0.72s | 0.12 → 0.00 |
| Seller sign-up | 1.10s → 0.79s | 0.07 → 0.01 |
