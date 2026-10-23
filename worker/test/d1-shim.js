// A stand-in for Cloudflare D1 built on Node's SQLite, so tests run the real Worker code with
// `node --test` and no Cloudflare tooling. Supports what the app uses: prepare/bind/first/all/run/batch.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));
const plain = (row) => (row ? { ...row } : null);

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    for (const a of args) if (a === undefined || typeof a === 'boolean') throw new Error(`D1_TYPE_ERROR: unsupported value ${a}`);
    return new Statement(this.db, this.sql, args);
  }
  runSync() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first(column) {
    const row = plain(this.db.prepare(this.sql).get(...this.args));
    return column ? row?.[column] ?? null : row;
  }
  async all() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.args).map(plain) };
  }
  async run() {
    return this.runSync();
  }
}

export class D1Shim {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    for (const file of readdirSync(MIGRATIONS).sort()) this.db.exec(readFileSync(MIGRATIONS + file, 'utf8'));
  }
  prepare(sql) {
    return new Statement(this.db, sql);
  }
  // Like D1: the batch runs as one transaction and rolls back entirely on error.
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const results = statements.map((s) => s.runSync());
      this.db.exec('COMMIT');
      return results;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
