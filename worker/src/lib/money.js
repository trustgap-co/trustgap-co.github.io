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

// TrustGap's own fee: a percentage of the item price, with a minimum and no cap.
export function platformFee(itemPriceKobo, fee) {
  return Math.max(fee.minKobo, Math.round((itemPriceKobo * fee.percent) / 100));
}

const ceilNaira = (kobo) => Math.ceil(kobo / 100) * 100;

// "Payment processing": what Flutterwave takes, passed on at cost. Flutterwave charges a percentage
// of everything collected (including this processing line itself) plus a flat fee when the seller
// is paid out, so the amount is grossed up and rounded up to the next naira. `buyerShare` is the
// fraction of the fees the buyer pays (1, 0.5 or 0), because that changes how much is collected.
export function processingFee({ itemPrice, buyerDelivery, platform, buyerShare }, processing) {
  const r = processing.percent / 100;
  return ceilNaira((r * (itemPrice + buyerDelivery + buyerShare * platform) + processing.payoutFeeKobo) / (1 - r * buyerShare));
}

// Who pays what, from fixed amounts. Invariant: buyerTotal - sellerPayout = delivery + platform + processing.
export function splitCharges({ itemPrice, deliveryFee, deliveryPayer, feePayer, platformFee: pf, processingFee: pr }) {
  const buyerDelivery = deliveryPayer === 'buyer' ? deliveryFee : 0;
  const share = (amount) => (feePayer === 'buyer' ? amount : feePayer === 'split' ? Math.ceil(amount / 2) : 0);
  const buyerPlatformShare = share(pf);
  const buyerProcessingShare = share(pr);
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
  const buyerDelivery = deliveryPayer === 'buyer' ? deliveryFee : 0;
  const pf = platformFee(itemPrice, fee);
  const pr = processingFee({ itemPrice, buyerDelivery, platform: pf, buyerShare }, processing);
  return splitCharges({ itemPrice, deliveryFee, deliveryPayer, feePayer, platformFee: pf, processingFee: pr });
}
