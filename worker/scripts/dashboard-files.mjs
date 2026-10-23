// Builds the two files for setting up TrustGap from the Cloudflare dashboard (no terminal needed there):
//   dashboard/worker.js  — the whole Worker in ONE file, to paste into "Edit code"
//   dashboard/schema.sql — all database tables, to paste into the D1 console
// Run with `npm run dashboard-files` after `wrangler deploy --dry-run` has bundled the code.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
mkdirSync(new URL('dashboard/', root), { recursive: true });

const bundle = readFileSync(new URL('.bundle/index.js', root), 'utf8').replace(/\n\/\/# sourceMappingURL=.*\n?$/, '\n');
writeFileSync(
  new URL('dashboard/worker.js', root),
  `// TrustGap Worker — GENERATED FILE, do not edit by hand.
// Built from worker/src/ with \`npm run dashboard-files\`. Paste ALL of it into
// Cloudflare → Workers & Pages → trustgap-api → Edit code, replacing what is there, then Deploy.
${bundle}`,
);

const migrations = readdirSync(new URL('migrations/', root)).filter((f) => f.endsWith('.sql')).sort();
const sql = migrations
  .map((f) => readFileSync(new URL(`migrations/${f}`, root), 'utf8').replace(/^\s*--.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim())
  .join('\n\n');
writeFileSync(
  new URL('dashboard/schema.sql', root),
  `-- TrustGap database tables (${migrations.join(' + ')}). Paste into Cloudflare → D1 → trustgap → Console and run once.\n\n${sql}\n`,
);
console.log(`dashboard/worker.js (${Math.round(bundle.length / 1024)} KB) and dashboard/schema.sql (${migrations.length} migrations) written.`);
