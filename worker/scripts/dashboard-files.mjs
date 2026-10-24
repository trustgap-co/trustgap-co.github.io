// Builds dashboard/worker.js: the whole Worker in ONE file, to paste into the Cloudflare
// dashboard's "Edit code". The Worker creates its own database tables, so nothing else is needed.
// Run with `npm run dashboard-files` (it bundles the code with `wrangler deploy --dry-run` first).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
mkdirSync(new URL('dashboard/', root), { recursive: true });

const bundle = readFileSync(new URL('.bundle/index.js', root), 'utf8').replace(/\n\/\/# sourceMappingURL=.*\n?$/, '\n');
writeFileSync(
  new URL('dashboard/worker.js', root),
  `// TrustGap Worker: GENERATED FILE, do not edit by hand.
// Built from worker/src/ with \`npm run dashboard-files\`. Paste ALL of it into
// Cloudflare → Workers & Pages → trustgap-api → Edit code, replacing what is there, then Deploy.
${bundle}`,
);

console.log(`dashboard/worker.js (${Math.round(bundle.length / 1024)} KB) written. It creates its own database tables on first use.`);
