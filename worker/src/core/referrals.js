// Referrals: sellers invite sellers.
//  - Every seller has a personal invite code (sellers.ref_code), shared as a sign-up link.
//  - A seller who signs up with it gets REFERRAL_WELCOME_DEALS free deals (no TrustGap fee).
//  - The inviter gets REFERRAL_REWARD_DEALS free deal(s) once the new seller's first order of at least
//    REFERRAL_MIN_ORDER_NAIRA (item price) completes with no dispute. Not for sign-ups alone, never for the same
//    person (same phone, bank account or identity), at most REFERRAL_MONTHLY_CAP rewards a month.
//  - Free deals expire after REFERRAL_CREDIT_DAYS; one is used up when a link with it is paid or still
//    open (an expired or cancelled link gives it back).
//  - REFERRAL_AMBASSADOR_AT successful invites earns the "TrustGap Ambassador" badge buyers see.
// A free deal removes only TrustGap's own fee; payment processing and delivery are paid as usual.
import { first, all, run, insert } from '../lib/db.js';
import { randomDigits } from '../lib/crypto.js';
import { iso, addHours, getSeller, logEvent } from './common.js';

export const FREE_DEAL_CODE = 'FREE-DEAL';
const ACTIVE = "('expired', 'cancelled', 'replaced')"; // link states that give a free deal back

// The seller's invite code, created the first time it's needed: letters from the business name + digits.
export async function refCode(ctx, seller) {
  if (seller.ref_code) return seller.ref_code;
  const base = String(seller.business_name || seller.full_name || 'TG').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) || 'TG';
  for (let i = 0; i < 5; i++) {
    const code = `${base}${randomDigits(3)}`;
    const res = await run(ctx.env, 'UPDATE sellers SET ref_code = ? WHERE id = ? AND ref_code IS NULL AND NOT EXISTS (SELECT 1 FROM sellers WHERE ref_code = ?)', code, seller.id, code);
    if (res.meta.changes === 1) return code;
    const now = await first(ctx.env, 'SELECT ref_code FROM sellers WHERE id = ?', seller.id);
    if (now?.ref_code) return now.ref_code;
  }
  throw new Error('Could not create an invite code.');
}

export const inviteLink = (ctx, code) => `${ctx.config.siteUrl}/seller/signup.html?ref=${encodeURIComponent(code)}`;
export const findReferrer = (ctx, code) =>
  first(ctx.env, 'SELECT * FROM sellers WHERE ref_code = ? AND suspended_at IS NULL', String(code || '').trim().toUpperCase());

async function grant(ctx, sellerId, count, source, referralId = null) {
  const expires = iso(addHours(ctx.now(), ctx.config.referrals.creditDays * 24));
  for (let i = 0; i < count; i++) {
    await insert(ctx.env, 'free_deals', { seller_id: sellerId, source, referral_id: referralId, expires_at: expires, created_at: iso(ctx.now()) });
  }
}

// At sign-up: remember who invited them and give the welcome free deals.
export async function recordReferral(ctx, newSellerId, code) {
  if (!ctx.config.referrals.on || !code) return null;
  const referrer = await findReferrer(ctx, code);
  if (!referrer || referrer.id === newSellerId) return null;
  if (await first(ctx.env, 'SELECT id FROM referrals WHERE referred_id = ?', newSellerId)) return null;
  const id = await insert(ctx.env, 'referrals', { referrer_id: referrer.id, referred_id: newSellerId, status: 'pending', created_at: iso(ctx.now()) });
  await run(ctx.env, 'UPDATE sellers SET referred_by = ? WHERE id = ?', referrer.id, newSellerId);
  await grant(ctx, newSellerId, ctx.config.referrals.welcomeDeals, 'welcome', id);
  return referrer;
}

// Free deals the seller can use now (not expired, not tied to an open or paid link). `revising`: the
// link being replaced, whose free deal can move to the new version.
export async function availableFreeDeal(ctx, seller, revising = null) {
  return first(ctx.env, `SELECT f.* FROM free_deals f LEFT JOIN deals d ON d.id = f.used_on_deal_id
    WHERE f.seller_id = ? AND f.expires_at > ? AND (f.used_on_deal_id IS NULL OR d.status IN ${ACTIVE} OR d.id IS ?)
    ORDER BY f.expires_at LIMIT 1`, seller.id, iso(ctx.now()), revising);
}
export async function freeDealsLeft(ctx, sellerId) {
  return (await first(ctx.env, `SELECT COUNT(*) n FROM free_deals f LEFT JOIN deals d ON d.id = f.used_on_deal_id
    WHERE f.seller_id = ? AND f.expires_at > ? AND (f.used_on_deal_id IS NULL OR d.status IN ${ACTIVE})`, sellerId, iso(ctx.now()))).n;
}

// When an order completes (released to the seller): reward whoever invited this seller, once.
export async function rewardReferral(ctx, order) {
  const cfg = ctx.config.referrals;
  if (!cfg.on) return null;
  const ref = await first(ctx.env, "SELECT * FROM referrals WHERE referred_id = ? AND status = 'pending'", order.seller_id);
  if (!ref) return null;
  const deal = await first(ctx.env, 'SELECT item_price FROM deals WHERE id = ?', order.deal_id);
  if (deal.item_price < cfg.minOrderKobo) return null; // wait for an order with a bigger item price
  if (await first(ctx.env, 'SELECT id FROM disputes WHERE order_id = ?', order.id)) return null;
  const referrer = await getSeller(ctx, ref.referrer_id);
  const referred = await getSeller(ctx, ref.referred_id);
  const block = async (note) => {
    await run(ctx.env, "UPDATE referrals SET status = 'blocked', note = ?, order_id = ? WHERE id = ?", note, order.id, ref.id);
    await logEvent(ctx, order.id, 'system', 'referral_blocked', note);
    return null;
  };
  // The same person on both sides, or buying from themselves.
  const samePerson = (referrer.payout_account_number && referrer.payout_account_number === referred.payout_account_number)
    || (referrer.id_last4 && referrer.id_verified_name && referrer.id_last4 === referred.id_last4 && referrer.id_verified_name === referred.id_verified_name);
  if (samePerson) return block('Same bank account or identity as the inviter.');
  if ([referrer.phone, referred.phone].includes(order.buyer_phone)) return block('The buyer was the inviter or the seller.');
  if (referrer.suspended_at) return block('The inviter is suspended.');
  const month = iso(addHours(ctx.now(), -30 * 24));
  const recent = await first(ctx.env, "SELECT COUNT(*) n FROM referrals WHERE referrer_id = ? AND status = 'rewarded' AND rewarded_at > ?", referrer.id, month);
  if (recent.n >= cfg.monthlyCap) return block(`The inviter already had ${cfg.monthlyCap} rewards in the last 30 days.`);

  const won = await run(ctx.env, "UPDATE referrals SET status = 'rewarded', rewarded_at = ?, order_id = ? WHERE id = ? AND status = 'pending'", iso(ctx.now()), order.id, ref.id);
  if (won.meta.changes !== 1) return null;
  await grant(ctx, referrer.id, cfg.rewardDeals, 'referral', ref.id);
  await logEvent(ctx, order.id, 'system', 'referral_rewarded', { referrer: referrer.id });
  const total = await rewardedCount(ctx, referrer.id);
  await ctx.notify.send({ event: 'referral_rewarded', phone: referrer.phone,
    sms: `TrustGap: ${referred.business_name}, who joined with your invite, just completed their first protected deal. You’ve earned ${cfg.rewardDeals === 1 ? 'a free deal' : `${cfg.rewardDeals} free deals`} (no TrustGap fee), used on your next link.${total === cfg.ambassadorAt ? ' You are now a TrustGap Ambassador: buyers see your badge.' : ''}` });
  return { referrer_id: referrer.id };
}

export const rewardedCount = async (ctx, sellerId) =>
  (await first(ctx.env, "SELECT COUNT(*) n FROM referrals WHERE referrer_id = ? AND status = 'rewarded'", sellerId)).n;

// The seller's invite card on the dashboard.
export async function referralView(ctx, seller) {
  const code = await refCode(ctx, seller);
  const counts = await first(ctx.env, `SELECT COUNT(*) invited, SUM(status = 'rewarded') active FROM referrals WHERE referrer_id = ?`, seller.id);
  const soon = await first(ctx.env, `SELECT MIN(f.expires_at) at FROM free_deals f LEFT JOIN deals d ON d.id = f.used_on_deal_id
    WHERE f.seller_id = ? AND f.expires_at > ? AND (f.used_on_deal_id IS NULL OR d.status IN ${ACTIVE})`, seller.id, iso(ctx.now()));
  const active = counts.active || 0;
  return {
    on: ctx.config.referrals.on,
    code,
    link: inviteLink(ctx, code),
    invited: counts.invited || 0,
    active,
    free_deals: await freeDealsLeft(ctx, seller.id),
    next_expiry: soon?.at || null,
    ambassador: active >= ctx.config.referrals.ambassadorAt,
    ambassador_at: ctx.config.referrals.ambassadorAt,
    welcome_deals: ctx.config.referrals.welcomeDeals,
    reward_deals: ctx.config.referrals.rewardDeals,
    min_order: ctx.config.referrals.minOrderKobo,
  };
}

// For the admin: who brought in the most active sellers.
export async function topReferrers(ctx, limit = 10) {
  return all(ctx.env, `SELECT s.id, s.business_name, COUNT(r.id) invited, SUM(r.status = 'rewarded') active, SUM(r.status = 'blocked') blocked
    FROM referrals r JOIN sellers s ON s.id = r.referrer_id GROUP BY s.id ORDER BY active DESC, invited DESC LIMIT ?`, limit);
}
