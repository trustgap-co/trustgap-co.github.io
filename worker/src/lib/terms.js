import { sha256Hex } from './crypto.js';
import { formatNaira } from './money.js';

export const TERMS_VERSION = '2026-10-pilot-1';

export const RULES = (deal) => [
  'Your payment is held by TrustGap. The seller is not paid until the item is delivered and the inspection period ends.',
  'Check the item at the door. Only give the rider your 4-digit delivery PIN if it matches this description.',
  `After delivery you have ${deal.inspection_hours} hours to report a hidden problem. If you report nothing, the seller is paid automatically.`,
  `If the seller does not hand the item to the courier within ${deal.delivery_days} day(s), you get a full refund.`,
  'Wrong, fake, damaged or not-as-described item: the item goes back to the seller and you get a full refund.',
  'If you refuse a correct item, the cost of delivery and return may be deducted from your refund. Every deduction is shown to you in writing.',
  'Disputes are decided by TrustGap staff using evidence from both sides and the courier. You can appeal once by replying to the decision.',
];

// The exact deal and rules the buyer sees and accepts. Stored with the order, hashed, never changed.
export async function snapshotTerms(deal, seller, photoHashes = [], promo = null, acknowledgedAt = null) {
  const terms = {
    version: TERMS_VERSION,
    deal_token: deal.token,
    seller: { business_name: seller.business_name, identity_verified: Boolean(seller.identity_verified_at) },
    item: {
      title: deal.item_title,
      description: deal.item_description,
      condition: deal.item_condition,
      quantity: deal.quantity,
      photos_sha256: photoHashes,
    },
    money: {
      item_price: deal.item_price,
      delivery_fee: deal.delivery_fee,
      delivery_payer: deal.delivery_payer,
      platform_fee: deal.platform_fee,
      processing_fee: deal.processing_fee,
      fee_payer: deal.fee_payer,
      promo_code: promo?.code || deal.promo_code || null,
      promo_discount: promo?.discount || 0,
      buyer_total: deal.buyer_total - (promo?.discount || 0),
    },
    delivery: {
      address: deal.delivery_address,
      landmark: deal.delivery_landmark,
      state: deal.delivery_state,
      ships_from: deal.pickup_state,
      ship_within_days: deal.delivery_days,
      weight_kg: deal.weight_kg,
    },
    inspection_hours: deal.inspection_hours,
    rules: RULES(deal),
    // The change-of-mind notice the buyer accepted in a pop-up before continuing (exact wording).
    buyer_acknowledgement: acknowledgedAt && { text: fillConsent('buyer', deal.delivery_fee), at: acknowledgedAt },
  };
  const json = JSON.stringify(terms);
  return { json, hash: await sha256Hex(json) };
}

// The two confirmations shown as pop-ups before a deal goes ahead. The website shows exactly this
// wording (from /api/config, with {fee} filled in), and the filled-in wording is what gets recorded.
export const CONSENTS = {
  seller: {
    title: 'Is the item in good condition, exactly as agreed with the buyer?',
    body: 'If the buyer reports a problem and TrustGap finds the item was not in the condition you described, the buyer’s money is refunded and you pay for the delivery and the return of the item: twice the delivery fee ({fee}).',
    confirm: 'The item is in good condition as agreed',
  },
  buyer: {
    title: 'Before you pay: changing your mind has a cost',
    body: 'Once you pay, the seller sends the item. If you change your mind after paying, or refuse or send back an item that matches this description when it reaches you, the delivery and the return are paid from your refund: twice the delivery fee ({fee}). If the item is wrong, damaged, fake or not as described, you get a full refund.',
    confirm: 'I understand. Continue',
  },
};

export const fillConsent = (who, deliveryFeeKobo) =>
  `${CONSENTS[who].title} ${CONSENTS[who].body.replace('{fee}', formatNaira(2 * deliveryFeeKobo))}`;
