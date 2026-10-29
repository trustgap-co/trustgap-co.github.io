import { first, all, run, insert } from '../lib/db.js';
import { parsePhotos } from '../lib/photos.js';
import { UserError, iso, str, getOrder, logEvent } from './common.js';
import { checkedEvidence, evidenceDetails, evidenceUrls, PARCEL_LOCATIONS, MAX_DISPUTE_PHOTOS } from './orders.js';
import { activeReturn, startDoorReturn, bookPickupReturn } from './returns.js';

// One case per problem. Whoever reports first opens it; the others (buyer, seller, rider, courier)
// add their own account to it, with photos, instead of being told "a problem can't be reported".
// Whoever decides sees every account side by side, and any disagreement about where the parcel is.

export const PARTIES = { buyer: 'Buyer', seller: 'Seller', rider: 'Rider', courier: 'Courier' };
const MAX_PER_PARTY = 5;

// The case people can still add to: the newest dispute that hasn't been decided and paid out.
export const openCase = (ctx, orderId) =>
  first(ctx.env, "SELECT * FROM disputes WHERE order_id = ? AND status IN ('open', 'awaiting_return') ORDER BY id DESC", orderId);

export async function addStatement(ctx, order, { party, body, photos: photoInput, parcel = null }) {
  if (!PARTIES[party]) throw new UserError('Unknown party.');
  const dispute = await openCase(ctx, order.id);
  if (!dispute) throw new UserError('There is no open case on this order to add to.');
  const text = str(body).slice(0, 2000);
  if (text.length < 3) throw new UserError('Say what happened.');
  if (parcel && !PARCEL_LOCATIONS[parcel]) throw new UserError('Choose where the parcel is.');
  const count = await first(ctx.env, 'SELECT COUNT(*) n FROM dispute_statements WHERE dispute_id = ? AND party = ?', dispute.id, party);
  if (count.n >= MAX_PER_PARTY) throw new UserError('You’ve already added your side several times. Contact TrustGap support for anything else.');
  const photos = await checkedEvidence(ctx, order, await parsePhotos(photoInput, MAX_DISPUTE_PHOTOS));

  const now = iso(ctx.now());
  const id = await insert(ctx.env, 'dispute_statements', { dispute_id: dispute.id, party, body: text, parcel_location: parcel, created_at: now });
  for (const [i, p] of photos.entries()) {
    await insert(ctx.env, 'dispute_photos', {
      dispute_id: dispute.id, statement_id: id, position: 100 + i, mime: p.mime, data: p.data, sha256: p.sha256, bytes: p.bytes,
      source: p.source, stamp_code: p.stamp_code, captured_at: p.captured_at, phash: p.phash, flags: JSON.stringify(p.flags || []), created_at: now,
    });
  }
  await logEvent(ctx, order.id, party, 'statement_added', { party, parcel, photos: photos.length });
  await followParcel(ctx, await getOrder(ctx, order.id), party, parcel);
  return { dispute_id: dispute.id, statement_id: id };
}

// A refusal during delivery: make sure the parcel heads back to the seller, from wherever it is.
// Only acts when nothing is under way yet; a disagreement is left for staff (shown as a conflict).
async function followParcel(ctx, order, party, parcel) {
  if (!parcel || order.delivered_at || !order.dispatched_at) return;
  if (await activeReturn(ctx, order.id)) return;
  try {
    if (parcel === 'rider' && ['rider', 'courier'].includes(party)) {
      await run(ctx.env, "UPDATE orders SET delivery_status = 'refused' WHERE id = ?", order.id);
      await startDoorReturn(ctx, order, { by: party });
    } else if (parcel === 'buyer') { // the buyer says so, or the rider says they left it with the buyer
      await bookPickupReturn(ctx, order, { parcelWithBuyer: true, by: 'buyer' });
    }
  } catch (err) {
    await logEvent(ctx, order.id, 'system', 'return_booking_failed', err.message);
  }
}

// Every account in a case, for staff (`viewer` 'staff'), or for one side: buyers and sellers see their
// own accounts and the rider's or courier's, never each other's photos.
export async function caseView(ctx, dispute, { viewer = 'staff' } = {}) {
  if (!dispute) return null;
  const rows = await all(ctx.env, 'SELECT * FROM dispute_statements WHERE dispute_id = ? ORDER BY id', dispute.id);
  // The first report counts as its author's account (id null: its photos are the report's own).
  const opening = { id: null, party: dispute.opened_by, body: dispute.description, parcel_location: dispute.parcel_location, created_at: dispute.created_at, opening: true };
  const all_ = [opening, ...rows].filter((r) => PARTIES[r.party]);
  const visible = all_.filter((r) => viewer === 'staff' || r.party === viewer || ['rider', 'courier'].includes(r.party));
  const statements = await Promise.all(visible.map(async (r) => ({
    id: r.id, party: r.party, party_label: PARTIES[r.party], body: r.body, created_at: r.created_at, opening: Boolean(r.opening),
    parcel_location: r.parcel_location, parcel_label: r.parcel_location && PARCEL_LOCATIONS[r.parcel_location],
    photos: viewer === 'staff' ? await evidenceDetails(ctx, dispute.id, { statementId: r.id })
      : r.party === viewer ? await evidenceUrls(ctx, dispute.id, { statementId: r.id }) : [],
  })));
  // Who says the parcel is where: the first report, then each account that answered the question.
  const claims = [
    ...(dispute.parcel_location ? [{ party: dispute.opened_by, at: dispute.parcel_location }] : []),
    ...rows.filter((r) => r.parcel_location).map((r) => ({ party: r.party, at: r.parcel_location })),
  ];
  const latest = {};
  for (const c of claims) latest[c.party] = c.at;
  const places = new Set(Object.values(latest));
  return {
    statements,
    parties_heard: [...new Set([dispute.opened_by, ...rows.map((r) => r.party)])],
    parcel_conflict: places.size > 1
      ? Object.entries(latest).map(([p, at]) => `${PARTIES[p] || p}: ${at === 'rider' ? 'the rider has it' : 'the buyer has it'}`).join(' · ')
      : null,
  };
}
