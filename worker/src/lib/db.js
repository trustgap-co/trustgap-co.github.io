// Thin helpers over Cloudflare D1. D1 rejects undefined and booleans, so values are normalised.
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);

export const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args.map(norm));
export const first = (env, sql, ...args) => stmt(env, sql, ...args).first();
export const all = async (env, sql, ...args) => (await stmt(env, sql, ...args).all()).results;
export const run = (env, sql, ...args) => stmt(env, sql, ...args).run();

export function insertStmt(env, table, row) {
  const keys = Object.keys(row);
  return stmt(env, `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => row[k]));
}

export async function insert(env, table, row) {
  return (await insertStmt(env, table, row).run()).meta.last_row_id;
}

export function updateStmt(env, table, id, fields) {
  const keys = Object.keys(fields);
  return stmt(env, `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => fields[k]), id);
}

export const update = (env, table, id, fields) => updateStmt(env, table, id, fields).run();

// An INSERT that only happens if `guard` (an SQL condition) holds inside the same batch.
export function guardedInsert(env, table, row, guard) {
  const keys = Object.keys(row);
  return stmt(env, `INSERT INTO ${table} (${keys.join(', ')}) SELECT ${keys.map(() => '?').join(', ')} WHERE ${guard}`, ...keys.map((k) => row[k]));
}
