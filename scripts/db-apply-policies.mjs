// scripts/db-apply-policies.mjs
// Aplica los SQL files de packages/db/policies/ en orden alfanumérico contra
// la DATABASE_URL del .env.local.
//
// Idempotente: cada policy file usa DROP POLICY IF EXISTS + CREATE POLICY.

import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const POLICIES_DIR = path.resolve(__dirname, '..', 'packages', 'db', 'policies');

async function applyFile(client, file) {
  const fullPath = path.join(POLICIES_DIR, file);
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
  const files = fs.readdirSync(POLICIES_DIR).filter((f) => f.endsWith('.sql')).sort();
  console.log(`[plan] applying ${files.length} policy file(s):`);
  for (const f of files) console.log(`  - ${f}`);

  for (const f of files) {
    await applyFile(client, f);
  }

  // Listar policies finales
  const { rows: policies } = await client.query(`
    SELECT
      polrelid::regclass::text AS table_name,
      polname AS policy_name
    FROM pg_policy
    WHERE polrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
    ORDER BY table_name, policy_name;
  `);
  console.log(`\n[verify] ${policies.length} policies activas:`);
  let prevTable = '';
  for (const p of policies) {
    if (p.table_name !== prevTable) {
      console.log(`  ${p.table_name}:`);
      prevTable = p.table_name;
    }
    console.log(`    - ${p.policy_name}`);
  }
} catch (err) {
  console.error('FATAL:', err.message);
  if (err.position) console.error('  position:', err.position);
  process.exit(1);
} finally {
  await client.end();
}
