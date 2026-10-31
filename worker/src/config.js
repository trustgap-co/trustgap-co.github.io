// Settings come from wrangler.toml [vars] and `wrangler secret put` (see SETUP.md).
export function loadConfig(env) {
  const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
  // Names typed into the Cloudflare dashboard often pick up a capital letter or a trailing space.
  const choice = (v, d) => String(v ?? '').trim().toLowerCase() || d;
  const testMode = env.TEST_MODE !== 'false';
  if (!env.APP_SECRET && !testMode) throw new Error('APP_SECRET must be set when TEST_MODE is false');
  return {
    testMode,
    appSecret: env.APP_SECRET || 'dev-only-insecure-secret',
    adminPassword: env.ADMIN_PASSWORD || (testMode ? 'admin' : ''),
    siteUrl: String(env.SITE_URL || 'http://localhost:8080').replace(/\/$/, ''),
    apiUrl: String(env.API_URL || 'http://localhost:8787').replace(/\/$/, ''),
    // Logo on Flutterwave's checkout page: a public square PNG/JPG. Defaults to the website's icon.
    checkoutLogoUrl: String(env.CHECKOUT_LOGO_URL || '').trim()
      || `${String(env.SITE_URL || 'http://localhost:8080').replace(/\/$/, '')}/assets/favicon.png`,
    paymentProvider: choice(env.PAYMENT_PROVIDER, 'mock'),
    logisticsProvider: choice(env.LOGISTICS_PROVIDER, 'manual'),
    identityProvider: choice(env.IDENTITY_PROVIDER, 'mock'),
    requireSellerId: env.REQUIRE_SELLER_ID !== 'false',
    // TrustGap fee: FEE_PERCENT of the price up to FEE_TIER_NAIRA, FEE_PERCENT_ABOVE on the rest,
    // with a minimum and a cap (a cap of 0 means no cap). 1.5% to ₦200,000, then 1%, at most ₦15,000.
    fee: {
      percent: num(env.FEE_PERCENT, 1.5),
      tierKobo: num(env.FEE_TIER_NAIRA, 200000) * 100,
      percentAbove: num(env.FEE_PERCENT_ABOVE, 1),
      minKobo: num(env.FEE_MIN_NAIRA, 100) * 100,
      maxKobo: num(env.FEE_CAP_NAIRA, 15000) * 100,
    },
    // Delivery is TrustGap's own service, priced as the courier's cost plus a handling margin
    // (DELIVERY_MARGIN_PERCENT, at most DELIVERY_MARGIN_CAP_NAIRA). Not added to your own riders'
    // prices (LOGISTICS_PROVIDER=manual), which you set directly.
    deliveryMargin: {
      percent: num(env.DELIVERY_MARGIN_PERCENT, 15),
      capKobo: num(env.DELIVERY_MARGIN_CAP_NAIRA, 2000) * 100,
    },
    // Dispute fee, paid by whoever TrustGap finds at fault: DISPUTE_FEE_PERCENT of the item price,
    // between DISPUTE_FEE_MIN_NAIRA and DISPUTE_FEE_NAIRA. DISPUTE_FEE_NAIRA = 0 switches it off.
    disputeFee: {
      maxKobo: num(env.DISPUTE_FEE_NAIRA, 3000) * 100,
      percent: num(env.DISPUTE_FEE_PERCENT, 10),
      minKobo: num(env.DISPUTE_FEE_MIN_NAIRA, 1000) * 100,
    },
    processing: {
      percent: num(env.PROCESSING_PERCENT, 2), // Flutterwave's charge on local NGN collections
      capKobo: num(env.PROCESSING_CAP_NAIRA, 2000) * 100, // Flutterwave's cap on that charge per payment
      payoutFeeKobo: Math.round(num(env.PAYOUT_FEE_NAIRA, 57.79) * 100), // ₦53.75 transfer fee + 7.5% VAT (worst case)
    },
    // Flutterwave settles collections into the wallet T+1, so seller payouts wait this long after payment.
    settlementHours: num(env.SETTLEMENT_HOURS, 24),
    maxTransferAttempts: 3,
    maxIdentityAttempts: 3,
    // Largest deal a seller can create themselves; above it they contact support, and the admin can
    // raise the limit for that seller (Admin → Sellers).
    maxDealKobo: num(env.MAX_DEAL_NAIRA, 1000000) * 100,
    // The item price must be at least this many times the delivery fee, so a buyer who refuses a
    // correct item has paid enough to cover both delivery trips. 0 turns the rule off.
    minPriceDeliveryMultiple: num(env.MIN_PRICE_DELIVERY_MULTIPLE, 2),
    // Delivery prices used when LOGISTICS_PROVIDER=manual (your own riders). With Fez, the price
    // comes from Fez's /order/cost for the buyer's state instead.
    manualDelivery: {
      sameStateKobo: num(env.DELIVERY_SAME_STATE_NAIRA, 3000) * 100,
      otherStateKobo: num(env.DELIVERY_OTHER_STATE_NAIRA, 6000) * 100,
      vatPercent: num(env.DELIVERY_VAT_PERCENT, 7.5),
    },
    // Early-access code: removes the TrustGap fee from one deal per seller account and one order per
    // buyer phone number, until the end date (inclusive, Lagos time) or until it has been used
    // PROMO_MAX_USES times. Leave PROMO_CODE empty to switch the offer off.
    promo: {
      code: String(env.PROMO_CODE ?? 'EARLYGAP').trim().toUpperCase(),
      endsAt: env.PROMO_ENDS === '' ? null : new Date(`${env.PROMO_ENDS || '2027-01-31'}T23:59:59+01:00`),
      maxUses: num(env.PROMO_MAX_USES, 1000),
    },
    inspectionHours: num(env.INSPECTION_HOURS, 24),
    paymentTimeoutMinutes: num(env.PAYMENT_TIMEOUT_MINUTES, 60),
    pinMaxAttempts: 5,
    otp: { ttlMinutes: 10, maxAttempts: 5, maxPerWindow: 3, windowMinutes: 15 },
    // Most login/sign-up code SMS sent in a day, across everyone: a cap on SMS spending if abused.
    otpDailyLimit: num(env.OTP_DAILY_LIMIT, 300),
    sessionDays: 30,
    riderLinkDays: 14,
    // How long the buyer has to hand a returned item to the courier before TrustGap staff step in.
    returnPickupDays: num(env.RETURN_PICKUP_DAYS, 3),
  };
}
