import { first, insert, run, update } from '../../lib/db.js';
import { hmac } from '../../lib/crypto.js';

// Every SMS/email is stored in the outbox, then handed to a Make.com webhook. Your Make scenario
// sends the SMS through KudiSMS and the email through your mail module (see SETUP.md).
export function createNotifier(ctx) {
  return {
    async send({ orderId = null, event, phone = null, email = null, sms, emailSubject = null }) {
      const id = await insert(ctx.env, 'outbox', {
        order_id: orderId,
        event,
        to_phone: phone,
        to_email: email,
        sms,
        email_subject: emailSubject,
        status: 'pending',
        created_at: ctx.now().toISOString(),
      });
      ctx.waitUntil(deliver(ctx, id));
      return id;
    },
  };
}

export async function deliver(ctx, id) {
  const { env } = ctx;
  if (!env.MAKE_WEBHOOK_URL) {
    await update(env, 'outbox', id, { status: 'logged' });
    return;
  }
  // Claim the row so two workers never send the same message.
  const claim = await run(env, "UPDATE outbox SET status = 'sending' WHERE id = ? AND status IN ('pending', 'failed')", id);
  if (claim.meta.changes !== 1) return;
  const row = await first(env, 'SELECT * FROM outbox WHERE id = ?', id);
  const order = row.order_id ? await first(env, 'SELECT ref FROM orders WHERE id = ?', row.order_id) : null;
  const body = JSON.stringify({
    id: row.id,
    event: row.event,
    to_phone: row.to_phone, // +2348031234567
    to_phone_intl: row.to_phone ? row.to_phone.replace(/^\+/, '') : null, // 2348031234567 (KudiSMS format)
    to_email: row.to_email,
    sms: row.sms,
    email_subject: row.email_subject || 'TrustGap',
    email_body: row.sms,
    order_ref: order?.ref || null,
    sent_at: ctx.now().toISOString(),
  });
  try {
    const res = await fetch(env.MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Lets your Make scenario check the message really came from your Worker.
        ...(env.MAKE_WEBHOOK_SECRET ? { 'X-TrustGap-Signature': await hmac(env.MAKE_WEBHOOK_SECRET, body) } : {}),
      },
      body,
    });
    if (!res.ok) throw new Error(`Make.com responded ${res.status}`);
    await update(env, 'outbox', id, { status: 'sent', attempts: row.attempts + 1, last_error: null });
  } catch (err) {
    await update(env, 'outbox', id, { status: 'failed', attempts: row.attempts + 1, last_error: String(err.message).slice(0, 300) });
  }
}
