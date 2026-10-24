// Copies migrations/*.sql into src/schema.js so the Worker can create and update its own tables
// (see src/lib/migrate.js). Run after adding a migration: `npm run embed-migrations`.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const files = readdirSync(new URL('migrations/', root)).filter((f) => f.endsWith('.sql')).sort();
const migrations = files.map((name) => ({ name, sql: readFileSync(new URL(`migrations/${name}`, root), 'utf8') }));
writeFileSync(
  new URL('src/schema.js', root),
  `// GENERATED from worker/migrations/*.sql by \`npm run embed-migrations\`. Do not edit by hand.\nexport const MIGRATIONS = ${JSON.stringify(migrations, null, 2)};\n`,
);
console.log(`src/schema.js: ${files.join(', ')}`);
