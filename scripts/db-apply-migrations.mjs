// scripts/db-apply-migrations.mjs
// Aplica los SQL files de packages/db/migrations/ en orden alfanumérico contra
// la DATABASE_URL del .env.local.
//
// Cada migration se ejecuta como UNA transacción (BEGIN; ... COMMIT;). Si falla
// algún statement, ROLLBACK y abort.
//
// Uso: node scripts/db-apply-migrations.mjs
//      node scripts/db-apply-migrations.mjs --only 001_init_schema.sql

import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'packages', 'db', 'migrations');
const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const onlyFile = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function applyMigration(client, file) {
  const fullPath = path.join(MIGRATIONS_DIR, file);
  const sql = fs.readFileSync(fullPath, 'utf8');
  console.log(`\n[apply] ${file} (${sql.length} chars)`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`[apply] ${file} → OK`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[apply] ${file} → FAILED`);
    throw err;
  }
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const { rows } = await client.query('SELECT current_database() AS db, version() AS pg');
  console.log(`[connected] ${rows[0].db} → ${rows[0].pg.split(',')[0]}`);

  const all = listMigrations();
  const files = onlyFile ? all.filter((f) => f === onlyFile) : all;

  if (files.length === 0) {
    console.error('FATAL: no migrations to apply');
    process.exit(1);
  }

  console.log(`[plan] applying ${files.length} migration(s) in order:`);
  for (const f of files) console.log(`  - ${f}`);

  for (const f of files) {
    await applyMigration(client, f);
  }

  console.log('\n[done] All migrations applied.');
} catch (err) {
  console.error('FATAL:', err.message);
  if (err.position) console.error('  position:', err.position);
  if (err.hint) console.error('  hint:', err.hint);
  process.exit(1);
} finally {
  await client.end();
}
