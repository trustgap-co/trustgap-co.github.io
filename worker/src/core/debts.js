// Seller debts from disputes (e.g. twice the delivery fee when the seller was at fault). They are still
// taken from the seller's next payout, but the seller can also pay straight away on the payment page.
import { first, insert, stmt } from '../lib/db.js';
import { randomToken } from '../lib/crypto.js';
import { formatNaira } from '../lib/money.js';
import { UserError, iso, getSeller } from './common.js';

export const isDebtRef = (txRef) => String(txRef || '').startsWith('TGD-');

// Opens a payment page for exactly what the seller owes now.
export async function startDebtPayment(ctx, seller) {
  if (!(seller.amount_owed > 0)) throw new UserError('You don’t owe anything.');
  const txRef = 'TGD-' + randomToken(12);
  const id = await insert(ctx.env, 'debt_payments', {
    seller_id: seller.id, amount: seller.amount_owed, tx_ref: txRef, status: 'pending', created_at: iso(ctx.now()),
  });
  // The payment providers take an order-like record; the seller is the payer here.
  const { url } = await ctx.payments.createCheckout({
    order: { tx_ref: txRef, amount: seller.amount_owed, ref: `DEBT-${id}`, buyer_email: seller.email, buyer_phone: seller.phone, buyer_name: seller.full_name },
    title: 'Settle your TrustGap balance',
  });
  return { payment_url: url, amount: seller.amount_owed };
}

// Called from the payment redirect and the webhook. Safe to call any number of times, in any order:
// the payment is checked with the provider, and the balance is reduced exactly once.
export async function confirmDebtPayment(ctx, txRef) {
  const row = await first(ctx.env, 'SELECT * FROM debt_payments WHERE tx_ref = ?', txRef);
  if (!row) return null;
  if (row.status !== 'pending') return row;
  const v = await ctx.payments.verify(txRef);
  if (v.status === 'failed') {
    await stmt(ctx.env, "UPDATE debt_payments SET status = 'failed' WHERE id = ? AND status = 'pending'", row.id).run();
    return { ...row, status: 'failed' };
  }
  if (v.status !== 'successful') return row;
  if (v.currency !== 'NGN' || v.amount < row.amount) {
    await stmt(ctx.env, "UPDATE debt_payments SET status = 'amount_mismatch', provider_tx_id = ? WHERE id = ? AND status = 'pending'", v.providerTxId, row.id).run();
    console.error('debt payment amount mismatch', txRef, v.amount, row.amount);
    return { ...row, status: 'amount_mismatch' };
  }
  const nonce = randomToken(12);
  const [won] = await ctx.env.DB.batch([
    stmt(ctx.env, "UPDATE debt_payments SET status = 'paid', paid_at = ?, provider_tx_id = ?, confirm_nonce = ? WHERE id = ? AND status = 'pending'",
      iso(ctx.now()), v.providerTxId, nonce, row.id),
    stmt(ctx.env, `UPDATE sellers SET amount_owed = MAX(0, amount_owed - ?) WHERE id = ?
      AND EXISTS (SELECT 1 FROM debt_payments WHERE id = ? AND confirm_nonce = ?)`, row.amount, row.seller_id, row.id, nonce),
  ]);
  if (won.meta.changes === 1) {
    const seller = await getSeller(ctx, row.seller_id);
    await ctx.notify.send({
      event: 'debt_paid', phone: seller.phone, email: seller.email,
      sms: `TrustGap: we received ${formatNaira(row.amount)}. ${seller.amount_owed > 0 ? `You still owe ${formatNaira(seller.amount_owed)}.` : 'Your balance is cleared. You can create links again.'}`,
    });
  }
  return first(ctx.env, 'SELECT * FROM debt_payments WHERE id = ?', row.id);
}
