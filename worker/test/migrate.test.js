import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { boot } from './helpers.js';
import { D1Shim } from './d1-shim.js';
import { MIGRATIONS } from '../src/schema.js';
import { ensureSchema, splitStatements } from '../src/lib/migrate.js';

const TABLES = ['checkouts', 'deal_photos', 'deals', 'debt_payments', 'dispute_photos', 'disputes', 'ledger', 'meta', 'mock_transactions', 'order_events', 'orders', 'otps', 'outbox', 'returns', 'sellers', 'sessions', 'staff', 'task_notes', 'tasks'];
const tables = async (db) =>
  (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name").all()).results.map((r) => r.name);

test('src/schema.js matches the migration files (run `npm run embed-migrations` if not)', () => {
  const dir = new URL('../migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(MIGRATIONS.map((m) => m.name), files);
  for (const m of MIGRATIONS) assert.equal(m.sql, readFileSync(new URL(m.name, dir), 'utf8'), m.name);
});

test('a brand-new database gets all its tables on the first request', async () => {
  const t = boot();
  assert.deepEqual(await tables(t.env.DB), []);
  assert.deepEqual((await t.get('/api/health')).data, { ok: true, database: 'connected', settings: 'ok' });
  assert.deepEqual(await tables(t.env.DB), TABLES);
  const applied = (await t.db('SELECT name FROM _migrations ORDER BY name')).map((r) => r.name);
  assert.deepEqual(applied, MIGRATIONS.map((m) => m.name));
});

test('several first requests at once set the database up exactly once', async () => {
  const db = new D1Shim();
  const envs = [1, 2, 3].map(() => ({ DB: db }));
  await Promise.all(envs.map(ensureSchema));
  assert.deepEqual(await tables(db), TABLES);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM _migrations').first()).n, MIGRATIONS.length);
});

test('a database set up earlier with wrangler is recognised and left alone', async () => {
  const db = new D1Shim();
  for (const m of MIGRATIONS) for (const s of splitStatements(m.sql)) await db.prepare(s).run();
  await db.prepare('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)').run();
  for (const m of MIGRATIONS) await db.prepare('INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)').bind(m.name, 'x').run();
  await ensureSchema({ DB: db });
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM _migrations').first()).n, 0);
});

test('a missing binding is reported clearly', async () => {
  await assert.rejects(() => ensureSchema({}), /No D1 binding called DB/);
});
