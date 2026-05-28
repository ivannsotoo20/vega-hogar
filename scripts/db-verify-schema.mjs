// scripts/db-verify-schema.mjs
// Verifica que el schema esperado de Fase 1 está en Supabase: tablas, enums,
// funciones helper, RLS habilitado, triggers updated_at.

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const EXPECTED_TABLES = [
  'tenants', 'users', 'offices', 'user_office_assignments',
  'properties', 'property_photos', 'property_owners',
  'leads', 'lead_preferences', 'lead_property_interest',
  'conversations', 'conversation_messages', 'message_schedules',
  'visits', 'prompt_blocks', 'integration_accounts',
  'permissions_matrix',
];

const EXPECTED_ENUMS = [
  'user_role', 'property_type', 'property_status', 'lead_intent',
  'lead_status', 'channel_type', 'conversation_status', 'visit_status',
  'message_role', 'integration_provider',
];

const EXPECTED_HELPERS = ['current_tenant', 'current_user_role', 'set_updated_at', 'rls_auto_enable'];

const TABLES_WITH_UPDATED_AT = [
  'tenants', 'users', 'offices', 'user_office_assignments',
  'properties', 'property_owners',
  'leads', 'lead_preferences', 'lead_property_interest',
  'conversations', 'message_schedules', 'visits',
  'prompt_blocks', 'integration_accounts',
  'permissions_matrix',
];

const client = new Client({ connectionString: process.env.DATABASE_URL });

let passes = 0;
let fails = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}${detail ? ' ' + detail : ''}`);
    passes++;
  } else {
    console.log(`  ✗ ${label}${detail ? ' ' + detail : ''}`);
    fails++;
  }
}

try {
  await client.connect();

  // --- Tablas ---
  const { rows: tables } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tableSet = new Set(tables.map((t) => t.table_name));
  console.log(`\n=== Tablas (esperadas ${EXPECTED_TABLES.length}, encontradas ${tables.length}) ===`);
  for (const t of EXPECTED_TABLES) {
    check(t, tableSet.has(t));
  }
  const extra = [...tableSet].filter((t) => !EXPECTED_TABLES.includes(t));
  if (extra.length > 0) console.log(`  (extras inesperadas: ${extra.join(', ')})`);

  // --- Enums ---
  const { rows: enums } = await client.query(`
    SELECT t.typname AS name FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typtype = 'e' AND n.nspname = 'public'
    ORDER BY name;
  `);
  const enumSet = new Set(enums.map((e) => e.name));
  console.log(`\n=== Enums (esperados ${EXPECTED_ENUMS.length}, encontrados ${enums.length}) ===`);
  for (const e of EXPECTED_ENUMS) {
    check(e, enumSet.has(e));
  }

  // --- Funciones helper ---
  const { rows: funcs } = await client.query(`
    SELECT routine_name FROM information_schema.routines
    WHERE routine_schema = 'public';
  `);
  const funcSet = new Set(funcs.map((f) => f.routine_name));
  console.log(`\n=== Funciones (esperadas ${EXPECTED_HELPERS.length}, encontradas ${funcs.length}) ===`);
  for (const f of EXPECTED_HELPERS) {
    check(f, funcSet.has(f));
  }

  // --- RLS habilitado ---
  const { rows: rls } = await client.query(`
    SELECT c.relname AS name, c.relrowsecurity AS rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `);
  console.log(`\n=== RLS habilitado en las ${rls.length} tablas ===`);
  for (const row of rls) {
    check(`${row.name} RLS=${row.rls}`, row.rls === true);
  }

  // --- Triggers updated_at ---
  const { rows: triggers } = await client.query(`
    SELECT event_object_table AS tbl
    FROM information_schema.triggers
    WHERE trigger_name = 'set_updated_at_trigger'
      AND trigger_schema = 'public';
  `);
  const trigSet = new Set(triggers.map((t) => t.tbl));
  console.log(`\n=== Triggers updated_at (esperados ${TABLES_WITH_UPDATED_AT.length}, encontrados ${triggers.length}) ===`);
  for (const t of TABLES_WITH_UPDATED_AT) {
    check(`${t}.set_updated_at_trigger`, trigSet.has(t));
  }

  console.log(`\n=== RESULTADO ===`);
  console.log(`  Pases: ${passes}`);
  console.log(`  Fallos: ${fails}`);
  if (fails > 0) process.exit(1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
