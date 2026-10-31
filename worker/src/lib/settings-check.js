// Risky or contradictory settings, in plain words, for the admin (never shown publicly).
// "danger": real people could be misled or money handled wrongly. "warn": fix before launch.
export function settingsCheck(ctx) {
  const { env, config } = ctx;
  const out = [];
  const add = (level, text) => out.push({ level, text });
  const live = !config.testMode;
  if (ctx.payments.blocked) add('danger', `Payments are switched off: ${ctx.payments.blocked}`);
  if (ctx.identity.blocked) add('danger', ctx.identity.blocked);
  const key = String(env.FLW_SECRET_KEY || '').trim();
  if (config.testMode && ctx.payments.name === 'flutterwave' && key.startsWith('FLWSECK-') && !key.startsWith('FLWSECK_TEST')) {
    add('danger', 'A live Flutterwave key is in use while TEST_MODE is true: pages say “no real money moves”, but it does. Set TEST_MODE = false, or use your test key.');
  }
  if (ctx.payments.name === 'mock' && ctx.logistics.live) add('warn', 'Fez is live (FEZ_API_BASE has no “sandbox”) while payments are simulated. Delivery prices are real; courier bookings are refused so no real rider is sent for a test order.');
  if (ctx.payments.name === 'flutterwave' && !env.FLW_WEBHOOK_HASH) add('warn', 'FLW_WEBHOOK_HASH isn’t set, so Flutterwave’s payment notifications are ignored (payments are still checked on return and by the timers).');
  if (live) {
    if (String(env.APP_SECRET || '').length < 32) add('danger', 'APP_SECRET is shorter than 32 characters. Use a long random value.');
    if (String(config.adminPassword || '').length < 12) add('danger', 'ADMIN_PASSWORD is missing or shorter than 12 characters.');
    for (const [k, v] of [['SITE_URL', config.siteUrl], ['API_URL', config.apiUrl]]) {
      if (!/^https:\/\//.test(v) || /localhost|127\.0\.0\.1/.test(v)) add('danger', `${k} is “${v}”: it must be your real https:// address.`);
    }
    if (ctx.logistics.name === 'manual') add('warn', 'Deliveries use your own riders (LOGISTICS_PROVIDER = manual). Fine for the pilot; switch to fez when ready.');
    if (!env.MAKE_WEBHOOK_URL) add('warn', 'MAKE_WEBHOOK_URL isn’t set, so no SMS or emails are sent.');
  }
  // Older settings typed into Cloudflare still win over the new defaults.
  if (env.FEE_CAP_NAIRA && Number(env.FEE_CAP_NAIRA) < 15000) add('warn', `FEE_CAP_NAIRA is set to ${env.FEE_CAP_NAIRA}, so the TrustGap fee stops there instead of the new ₦15,000. Delete it (or set 15000) under Settings → Variables.`);
  if (env.MAX_DEAL_NAIRA && Number(env.MAX_DEAL_NAIRA) < 1000000) add('warn', `MAX_DEAL_NAIRA is set to ${env.MAX_DEAL_NAIRA}, below the new ₦1,000,000. Delete it (or set 1000000) under Settings → Variables.`);
  if (!env.LEADS_WEBHOOK_URL) add('warn', 'LEADS_WEBHOOK_URL isn’t set, so survey and early-access answers aren’t forwarded to your Google Sheet.');
  return out;
}
