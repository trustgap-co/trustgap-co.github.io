import { MIGRATIONS } from '../schema.js';

// The Worker creates and updates its own database tables, so setting up from the Cloudflare
// dashboard needs no SQL console. Each migration in src/schema.js runs once, in order, as one
// all-or-nothing batch that also records it in `_migrations`. Databases set up with
// `wrangler d1 migrations apply` are recognised through wrangler's own `d1_migrations` table.

export function splitStatements(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function appliedMigrations(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)').run();
  const names = new Set((await db.prepare('SELECT name FROM _migrations').all()).results.map((r) => r.name));
  const wrangler = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'").first();
  if (wrangler) for (const r of (await db.prepare('SELECT name FROM d1_migrations').all()).results) names.add(r.name);
  return names;
}

async function migrate(db) {
  let applied = await appliedMigrations(db);
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    const statements = splitStatements(m.sql).map((s) => db.prepare(s));
    statements.push(db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').bind(m.name, new Date().toISOString()));
    try {
      await db.batch(statements);
    } catch (err) {
      // Another request may have applied it at the same moment; that's fine if it's now recorded.
      applied = await appliedMigrations(db);
      if (!applied.has(m.name)) throw new Error(`Database setup (${m.name}) failed: ${err.message}`);
    }
  }
}

// Once per database per Worker instance; a failure is retried on the next request.
const ready = new WeakMap();
export function ensureSchema(env) {
  if (!env.DB) return Promise.reject(new Error('No D1 binding called DB. Add it under Settings → Bindings.'));
  let p = ready.get(env.DB);
  if (!p) {
    p = migrate(env.DB).catch((err) => {
      ready.delete(env.DB);
      throw err;
    });
    ready.set(env.DB, p);
  }
  return p;
}
