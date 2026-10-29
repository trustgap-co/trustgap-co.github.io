import { first, insert, run, update } from '../lib/db.js';
import { hmac, randomDigits, randomToken, safeEqual, sha256Hex } from '../lib/crypto.js';
import { namesMatch } from '../lib/names.js';
import { hit } from '../lib/limits.js';
import { TOS_VERSION, acceptedTerms } from '../lib/terms.js';
import { UserError, iso, str, requireLength, normalisePhone, validEmail, getSeller } from './common.js';

// ---------------------------------------------------------------- one-time codes (login by SMS)

// `deliver: false` records a code without sending it (a phone with no account), so the reply and the
// limits are the same whether or not the number has an account.
export async function sendCode(ctx, phone, email = null, { deliver = true } = {}) {
  const { otp } = ctx.config;
  const since = iso(new Date(ctx.now().getTime() - otp.windowMinutes * 60_000));
  const recent = await first(ctx.env, 'SELECT COUNT(*) n FROM otps WHERE phone = ? AND created_at > ?', phone, since);
  if (recent.n >= otp.maxPerWindow) {
    throw new UserError(`Too many codes requested. Wait ${otp.windowMinutes} minutes and try again.`, 429);
  }
  if (deliver && !(await hit(ctx, `otp-day:${iso(ctx.now()).slice(0, 10)}`, ctx.config.otpDailyLimit, 86_400))) {
    console.error('Daily SMS budget for login codes reached (OTP_DAILY_LIMIT)');
    throw new UserError('We can’t send codes right now. Please try again later.', 503);
  }
  const code = randomDigits(6);
  await insert(ctx.env, 'otps', {
    phone,
    code_hash: await hmac(ctx.config.appSecret, `otp:${phone}:${code}`),
    expires_at: iso(new Date(ctx.now().getTime() + otp.ttlMinutes * 60_000)),
    created_at: iso(ctx.now()),
  });
  if (!deliver) return {};
  await ctx.notify.send({
    event: 'login_code',
    phone,
    email,
    sms: `Your TrustGap code is ${code}. It expires in ${otp.ttlMinutes} minutes. Never share it with anyone.`,
    emailSubject: 'Your TrustGap login code',
  });
  // In test mode the code is returned so you can sign in without a real SMS.
  return ctx.config.testMode ? { dev_code: code } : {};
}

export async function signup(ctx, input) {
  const fullName = requireLength(input.full_name, 'Full name', 3, 100);
  if (fullName.split(/\s+/).length < 2) throw new UserError('Enter your full name (first and last name), as on your bank account.');
  const businessName = requireLength(input.business_name, 'Business name', 2, 80);
  const phone = normalisePhone(input.phone);
  const email = validEmail(input.email);
  const existing = await first(ctx.env, 'SELECT * FROM sellers WHERE phone = ?', phone);
  // An existing account gets a login code instead, and the same reply, so sign-up doesn't reveal
  // which numbers have accounts. Their details aren't changed.
  if (existing?.phone_verified_at) return { phone, ...(await sendCode(ctx, phone, existing.email)) };
  if (!acceptedTerms(input)) throw new UserError('Tick the box to accept the TrustGap Terms of Service and Seller Terms. You can’t create an account without accepting them.');
  const terms = { terms_accepted_at: iso(ctx.now()), terms_version: TOS_VERSION };
  const marketing = input.marketing_opt_in === true || input.marketing_opt_in === 'yes' ? iso(ctx.now()) : null;
  if (existing) {
    await update(ctx.env, 'sellers', existing.id, { full_name: fullName, business_name: businessName, email, marketing_opt_in_at: marketing, ...terms });
  } else {
    await insert(ctx.env, 'sellers', { full_name: fullName, business_name: businessName, phone, email, marketing_opt_in_at: marketing, ...terms, created_at: iso(ctx.now()) });
  }
  return { phone, ...(await sendCode(ctx, phone, email)) };
}

export async function requestLogin(ctx, input) {
  const phone = normalisePhone(input.phone);
  const seller = await first(ctx.env, 'SELECT * FROM sellers WHERE phone = ?', phone);
  // Same reply whether or not the number has an account (nothing is sent if it hasn't).
  if (!seller) return { phone, ...(await sendCode(ctx, phone, null, { deliver: false })) };
  return { phone, ...(await sendCode(ctx, phone, seller.email)) };
}

export async function verifyCode(ctx, input) {
  const phone = normalisePhone(input.phone);
  const code = str(input.code);
  const { otp } = ctx.config;
  const row = await first(
    ctx.env,
    'SELECT * FROM otps WHERE phone = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1',
    phone,
    iso(ctx.now()),
  );
  if (!row) throw new UserError('That code has expired. Request a new one.');
  if (row.attempts >= otp.maxAttempts) throw new UserError('Too many wrong codes. Request a new one.');
  if (!safeEqual(row.code_hash, await hmac(ctx.config.appSecret, `otp:${phone}:${code}`))) {
    await run(ctx.env, 'UPDATE otps SET attempts = attempts + 1 WHERE id = ?', row.id);
    throw new UserError(`Wrong code. ${otp.maxAttempts - row.attempts - 1} attempt(s) left.`);
  }
  const claimed = await run(ctx.env, 'UPDATE otps SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL', iso(ctx.now()), row.id);
  if (claimed.meta.changes !== 1) throw new UserError('That code was already used. Request a new one.');
  const seller = await first(ctx.env, 'SELECT * FROM sellers WHERE phone = ?', phone);
  if (!seller) throw new UserError('That code is wrong or has expired. Request a new one.');
  if (!seller.phone_verified_at) await update(ctx.env, 'sellers', seller.id, { phone_verified_at: iso(ctx.now()) });
  return { token: await createSession(ctx, { sellerId: seller.id }) };
}

// ---------------------------------------------------------------- sessions (bearer tokens)

export async function createSession(ctx, { sellerId = null, isAdmin = false, staffId = null }) {
  const token = randomToken(32);
  const hours = isAdmin || staffId ? 12 : ctx.config.sessionDays * 24;
  await insert(ctx.env, 'sessions', {
    token_hash: await sha256Hex(token),
    seller_id: sellerId,
    is_admin: isAdmin,
    ...(staffId ? { staff_id: staffId } : {}),
    expires_at: iso(new Date(ctx.now().getTime() + hours * 3_600_000)),
    created_at: iso(ctx.now()),
  });
  return token;
}

export async function authenticate(ctx, request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/);
  if (!m) return null;
  return first(ctx.env, 'SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', await sha256Hex(m[1]), iso(ctx.now()));
}

export async function logout(ctx, session) {
  if (session) await run(ctx.env, 'DELETE FROM sessions WHERE token_hash = ?', session.token_hash);
}

export async function adminLogin(ctx, input) {
  const { env } = ctx;
  const windowStart = iso(new Date(ctx.now().getTime() - 15 * 60_000));
  const fails = JSON.parse((await first(env, "SELECT value FROM meta WHERE key = 'admin_fails'"))?.value || '[]').filter((t) => t > windowStart);
  if (fails.length >= 10) throw new UserError('Too many attempts. Try again in 15 minutes.', 429);
  if (!ctx.config?.adminPassword || !safeEqual(str(input.password), ctx.config.adminPassword)) {
    fails.push(iso(ctx.now()));
    await run(env, "INSERT INTO meta (key, value) VALUES ('admin_fails', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(fails));
    throw new UserError('Wrong password.', 401);
  }
  return { token: await createSession(ctx, { isAdmin: true }) };
}

// ---------------------------------------------------------------- seller profile

export function sellerView(s) {
  return {
    id: s.id,
    full_name: s.full_name,
    business_name: s.business_name,
    phone: s.phone,
    email: s.email,
    pickup_address: s.pickup_address,
    pickup_state: s.pickup_state,
    payout: s.payout_verified_at
      ? { bank_name: s.payout_bank_name, account_number: s.payout_account_number, account_name: s.payout_account_name }
      : null,
    identity_verified: Boolean(s.identity_verified_at),
    identity_verified_at: s.identity_verified_at,
    id_type: s.id_type,
    id_attempts_left: Math.max(0, 3 - (s.id_attempts || 0)),
    amount_owed: s.amount_owed,
    marketing_opt_in: Boolean(s.marketing_opt_in_at),
    suspended: Boolean(s.suspended_at),
  };
}

export async function setPayoutAccount(ctx, seller, input) {
  const bankCode = str(input.bank_code);
  const accountNumber = str(input.account_number);
  if (!/^\d{10}$/.test(accountNumber)) throw new UserError('Account number must be 10 digits.');
  const bank = (await ctx.payments.listBanks()).find((b) => b.code === bankCode);
  if (!bank) throw new UserError('Choose your bank.');
  let accountName;
  try {
    ({ accountName } = await ctx.payments.resolveAccount({ bankCode, accountNumber }));
  } catch (err) {
    throw new UserError(err.locked ? err.message : `Payout account: ${err.message}`, err.locked ? 503 : 400);
  }
  if (!namesMatch(seller.full_name, accountName)) {
    throw new UserError(
      `That account belongs to "${accountName}", which does not match your registered name "${seller.full_name}". Payouts can only go to an account in your own name.`,
    );
  }
  await update(ctx.env, 'sellers', seller.id, {
    payout_bank_code: bankCode,
    payout_bank_name: bank.name,
    payout_account_number: accountNumber,
    payout_account_name: accountName,
    payout_verified_at: iso(ctx.now()),
  });
  return sellerView(await getSeller(ctx, seller.id));
}

// NIN check through Monnify. Each completed check costs money, so a seller gets
// config.maxIdentityAttempts tries; outages on Monnify's side don't count. After that, admin can
// verify the seller by hand.
export async function verifyIdentity(ctx, seller, input) {
  if (seller.identity_verified_at) throw new UserError('Your identity is already verified.');
  const max = ctx.config.maxIdentityAttempts;
  if (seller.id_attempts >= max) {
    throw new UserError(`You have used all ${max} verification attempts. Contact TrustGap support to finish verification.`, 429);
  }
  const nin = str(input.nin ?? input.id_number).replace(/\s/g, '');
  if (!/^\d{11}$/.test(nin)) throw new UserError('Your NIN is 11 digits.');
  const dob = str(input.dob);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new UserError('Enter your date of birth.');

  const used = async () => {
    await run(ctx.env, 'UPDATE sellers SET id_attempts = id_attempts + 1 WHERE id = ?', seller.id);
    const left = max - seller.id_attempts - 1;
    return left > 0 ? ` You have ${left} attempt${left > 1 ? 's' : ''} left.` : ' That was your last attempt. Please contact TrustGap support.';
  };

  let person;
  try {
    person = await ctx.identity.verify({ idType: 'nin', idNumber: nin });
  } catch (err) {
    if (err.retryable) throw new UserError(`Identity check unavailable: ${err.message}`, 503);
    throw new UserError(`Identity check failed: ${err.message}.${await used()}`);
  }
  const officialName = [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
  if (!namesMatch(seller.full_name, officialName)) {
    throw new UserError(`This NIN is registered to a different name. It must match your account name "${seller.full_name}".${await used()}`);
  }
  if (person.dob && person.dob !== dob) {
    throw new UserError(`The date of birth does not match the NIN record.${await used()}`);
  }
  await update(ctx.env, 'sellers', seller.id, {
    id_type: 'nin',
    id_last4: nin.slice(-4),
    id_verified_name: officialName.toUpperCase(),
    id_provider_ref: person.providerRef || null,
    identity_verified_at: iso(ctx.now()),
  });
  return sellerView(await getSeller(ctx, seller.id));
}
