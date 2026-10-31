// All amounts are integer kobo (₦1 = 100 kobo) to avoid floating-point errors.

export function nairaToKobo(input) {
  const s = String(input ?? '').replace(/[,\s₦]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function formatNaira(kobo) {
  const naira = kobo / 100;
  return '₦' + naira.toLocaleString('en-NG', {
    minimumFractionDigits: kobo % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

// TrustGap's own fee: `percent` of the item price up to `tierKobo`, `percentAbove` on the rest, with a
// minimum and a cap (maxKobo 0 = no cap; tierKobo 0 = one rate for the whole price).
export function platformFee(itemPriceKobo, fee) {
  const tier = fee.tierKobo || Infinity;
  const above = Math.max(0, itemPriceKobo - tier);
  const raw = ((itemPriceKobo - above) * fee.percent + above * (fee.percentAbove ?? fee.percent)) / 100;
  const pf = Math.max(fee.minKobo, Math.round(raw));
  return fee.maxKobo ? Math.min(fee.maxKobo, pf) : pf;
}

// What TrustGap charges for delivery: the courier's price plus the handling margin, in whole naira.
export function deliveryPrice(courierKobo, margin) {
  if (!margin?.percent) return courierKobo;
  const m = Math.round((courierKobo * margin.percent) / 100);
  return Math.ceil((courierKobo + (margin.capKobo ? Math.min(m, margin.capKobo) : m)) / 100) * 100;
}

// The dispute fee for an item: a percentage of its price, between a minimum and a maximum.
export function disputeFee(itemPriceKobo, d) {
  if (!d?.maxKobo) return 0;
  return Math.min(d.maxKobo, Math.max(d.minKobo, Math.round((itemPriceKobo * d.percent) / 100 / 100) * 100));
}

const ceilNaira = (kobo) => Math.ceil(kobo / 100) * 100;

// "Payment processing": what Flutterwave takes, passed on at cost. Flutterwave charges a percentage
// of everything collected (including this processing line itself) plus a flat fee when the seller
// is paid out, so the amount is grossed up and rounded up to the next naira. `buyerShare` is the
// fraction of the fees the buyer pays (1, 0.5 or 0), because that changes how much is collected.
// Flutterwave caps its percentage at capKobo per payment (0 = no cap). When the grossed-up amount
// reaches the cap, the cap plus the payout fee is exactly what Flutterwave takes.
export function processingFee({ itemPrice, buyerDelivery, platform, buyerShare }, processing) {
  const r = processing.percent / 100;
  // A 50/50 split rounds the buyer's half of each fee up to whole naira, so up to ₦2 more can be
  // collected than buyerShare × fees; Flutterwave's percentage applies to that too.
  const roundingAllowance = buyerShare === 0.5 ? 200 : 0;
  const pr = (r * (itemPrice + buyerDelivery + buyerShare * platform + roundingAllowance) + processing.payoutFeeKobo) / (1 - r * buyerShare);
  return ceilNaira(processing.capKobo ? Math.min(pr, processing.capKobo + processing.payoutFeeKobo) : pr);
}

// Who pays what, from fixed amounts. Invariant: buyerTotal - sellerPayout = delivery + platform + processing.
// deliveryPayer and feePayer are each 'buyer', 'seller' or 'split'. A split gives the buyer half,
// rounded up to whole naira (no kobo on screen); the seller's half is the rest.
export const buyerPart = (payer, amount) => (payer === 'buyer' ? amount : payer === 'split' ? Math.ceil(amount / 200) * 100 : 0);

export function splitCharges({ itemPrice, deliveryFee, deliveryPayer, feePayer, platformFee: pf, processingFee: pr }) {
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
    sellerPayout: itemPrice - (deliveryFee - buyerDelivery) - (pf + pr - buyerFeeShare),
  };
}

// Prices a new deal with the current fee settings.
export function quote({ itemPrice, deliveryFee, deliveryPayer, feePayer }, fee, processing) {
  const buyerShare = feePayer === 'buyer' ? 1 : feePayer === 'split' ? 0.5 : 0;
  const buyerDelivery = buyerPart(deliveryPayer, deliveryFee);
  const pf = platformFee(itemPrice, fee);
  const pr = processingFee({ itemPrice, buyerDelivery, platform: pf, buyerShare }, processing);
  return splitCharges({ itemPrice, deliveryFee, deliveryPayer, feePayer, platformFee: pf, processingFee: pr });
}
