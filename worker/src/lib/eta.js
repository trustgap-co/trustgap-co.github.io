// Estimated delivery dates, from the courier's published timelines (Fez Delivery: within the same city
// 24-48 hours after pickup, up to 72 hours for remote areas; interstate 3-7 working days). TrustGap
// prices delivery by state, so "same city" is read as "same state". Always an estimate, never a promise.
//
// The estimate narrows as the order moves:
//   quote   (link not paid yet)  from now: the seller ships within `delivery_days`, then the courier
//   paid    (waiting for pickup) from payment until the ship-by date, then the courier
//   booked  (pickup booked)      pickup expected within a working day, then the courier
//   pickup  (picked up)          from the actual pickup time
// Working days are Monday to Friday, Lagos time (public holidays aren't counted).

const LAGOS_OFFSET = 60 * 60_000; // UTC+1, no daylight saving
const DAY = 24 * 60 * 60_000;

const lagosDay = (d) => new Date(d.getTime() + LAGOS_OFFSET).getUTCDay(); // 0 Sunday … 6 Saturday
export function addWorkingDays(d, n) {
  let t = new Date(d);
  let left = n;
  while (left > 0) {
    t = new Date(t.getTime() + DAY);
    if (![0, 6].includes(lagosDay(t))) left--;
  }
  return t;
}
const addHours = (d, h) => new Date(d.getTime() + h * 60 * 60_000);

// Transit time once the courier has the parcel: [earliest, latest] after `from`.
function transit(config, sameState, from) {
  const t = config.eta;
  return sameState
    ? [addHours(from, t.sameStateHours[0]), addHours(from, t.sameStateHours[1])]
    : [addWorkingDays(from, t.otherStateWorkingDays[0]), addWorkingDays(from, t.otherStateWorkingDays[1])];
}

// How long delivery takes after pickup, in words, e.g. "1–2 days after pickup within the state, up to 3 for remote areas".
export function transitLabel(config, sameState) {
  const t = config.eta;
  if (sameState) {
    const [a, b] = t.sameStateHours.map((h) => h / 24);
    return `${a}–${b} days after pickup within the state, up to ${t.sameStateRemoteHours / 24} for remote areas`;
  }
  const [a, b] = t.otherStateWorkingDays;
  return `${a}–${b} working days after pickup to another state`;
}

// The estimate for a deal or an order. `deal`: pickup_state, delivery_state, delivery_days.
// `order` (optional): paid_at, ship_by, dispatched_at, picked_up_at, delivered_at, status.
export function deliveryEstimate(config, now, deal, order = null) {
  if (order && (order.delivered_at || !['paid', 'shipping'].includes(order.status))) return null;
  const sameState = deal.pickup_state === (order?.delivery_state || deal.delivery_state);
  let basis;
  let early;
  let late;
  if (order?.picked_up_at) {
    basis = 'pickup';
    [early, late] = transit(config, sameState, new Date(order.picked_up_at));
  } else if (order?.dispatched_at) {
    basis = 'booked';
    const booked = new Date(order.dispatched_at);
    early = transit(config, sameState, booked)[0];
    late = transit(config, sameState, addWorkingDays(booked, 1))[1];
  } else if (order?.paid_at) {
    basis = 'paid';
    early = transit(config, sameState, new Date(order.paid_at))[0];
    late = transit(config, sameState, new Date(order.ship_by))[1];
  } else {
    basis = 'quote';
    early = transit(config, sameState, now)[0];
    late = transit(config, sameState, addHours(now, (deal.delivery_days || 1) * 24))[1];
  }
  // Never suggest a date already gone: if it's late, say "soon" from now.
  if (late < now) late = addHours(now, 24);
  if (early < now) early = now;
  return {
    earliest: early.toISOString(),
    latest: late.toISOString(),
    basis,
    same_state: sameState,
    transit: transitLabel(config, sameState),
    busy: Boolean(config.eta.busyUntil && now <= config.eta.busyUntil),
  };
}

const fmt = (d) => new Date(d).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' });
// For SMS: "Tue 11 Nov – Thu 13 Nov" (or one date when both fall on the same day).
export function estimateText(eta) {
  if (!eta) return '';
  const a = fmt(eta.earliest);
  const b = fmt(eta.latest);
  return a === b ? a : `${a} – ${b}`;
}
