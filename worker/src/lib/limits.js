// Rate limits, counted in D1 so they hold across all of Cloudflare's servers. Each rule allows `max`
// requests per `seconds` from one connection (Cloudflare's CF-Connecting-IP). Requests without that
// header (local development, tests) aren't limited by these rules.
import { first, run } from './db.js';
import { UserError } from './http.js';

const RULES = [
  { name: 'code', method: 'POST', path: /^\/api\/auth\/(signup|login)$/, max: 10, seconds: 3600 },
  { name: 'verify', method: 'POST', path: /^\/api\/auth\/verify$/, max: 20, seconds: 900 },
  { name: 'staff-login', method: 'POST', path: /^\/api\/(admin|team)\/login$/, max: 20, seconds: 900 },
  { name: 'checkout', method: 'POST', path: /^\/api\/deals\/[^/]+\/(accept|pay)$/, max: 40, seconds: 600 },
  { name: 'report', method: 'POST', path: /^\/api\/(track\/[^/]+\/(dispute|statement)|seller\/orders\/\d+\/(statement|return-problem)|rider\/[^/]+\/statement)$/, max: 20, seconds: 3600 },
  { name: 'stamp', method: 'GET', path: /\/photo-stamp$/, max: 60, seconds: 3600 },
  { name: 'pin', method: 'POST', path: /^\/api\/rider\/[^/]+\/(pin|return-pin)$/, max: 30, seconds: 900 },
  { name: 'leads', method: 'POST', path: /^\/api\/leads$/, max: 6, seconds: 3600 },
  { name: 'any-post', method: 'POST', path: /./, max: 300, seconds: 600 },
];

// Counts one request against `key`; false once more than `max` happen within `seconds`.
export async function hit(ctx, key, max, seconds) {
  const now = ctx.now();
  const reset = new Date(now.getTime() + seconds * 1000).toISOString();
  const row = await first(ctx.env,
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
     RETURNING count`, key, reset, now.toISOString(), now.toISOString());
  return row.count <= max;
}

export async function enforceLimits(ctx, request, method, path) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !ctx.env?.DB) return;
  for (const rule of RULES) {
    if (rule.method !== method || !rule.path.test(path)) continue;
    if (!(await hit(ctx, `${rule.name}:${ip}`, rule.max, rule.seconds))) {
      throw new UserError('Too many requests from this connection. Please wait a few minutes and try again.', 429);
    }
  }
}

export const clearOldLimits = (ctx) => run(ctx.env, 'DELETE FROM rate_limits WHERE reset_at < ?', ctx.now().toISOString());
