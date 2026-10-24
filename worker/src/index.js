import { Router, json, corsHeaders, readBody, UserError } from './lib/http.js';
import { createContext } from './context.js';
import { publicRoutes } from './routes/public.js';
import { sellerRoutes } from './routes/seller.js';
import { adminRoutes, riderRoutes } from './routes/admin.js';
import { runJobs } from './core/jobs.js';
import { syncSheets } from './providers/sheets.js';
import { ensureSchema } from './lib/migrate.js';

const router = new Router();
publicRoutes(router);
sellerRoutes(router);
riderRoutes(router);
adminRoutes(router);

export default {
  async fetch(request, env, execCtx) {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      const url = new URL(request.url);
      // Collapse repeated slashes so "…workers.dev//api/…" still finds its route.
      const match = router.match(request.method, url.pathname.replace(/\/{2,}/g, '/'));
      if (!match) throw new UserError('Not found', 404);
      if (url.pathname !== '/api/health') await ensureSchema(env); // creates/updates tables on first use
      const ctx = createContext(env, execCtx);
      const body = request.method === 'POST' ? await readBody(request) : {};
      const out = await match.handler({ ctx, request, params: match.params, body, url });
      res = out instanceof Response ? out : json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof UserError) {
        res = json({ error: err.message }, err.status);
      } else {
        console.error(err);
        res = json({ error: 'Something went wrong on our side. Your money is safe. Please try again in a moment.' }, 500);
      }
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    res.headers.set('X-Content-Type-Options', 'nosniff');
    return res;
  },

  // Cron trigger (wrangler.toml): timers every 5 minutes, Google Sheets copy every 15.
  async scheduled(event, env, execCtx) {
    await ensureSchema(env);
    const ctx = createContext(env, execCtx);
    await runJobs(ctx);
    if (new Date(event.scheduledTime).getUTCMinutes() % 15 === 0) {
      try {
        await syncSheets(ctx);
      } catch (err) {
        console.error('sheets sync failed', err);
      }
    }
  },
};
