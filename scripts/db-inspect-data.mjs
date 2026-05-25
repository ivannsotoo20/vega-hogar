// scripts/db-inspect-data.mjs
// Cuenta filas por tabla del schema `public` y muestra la definición de la
// función rls_auto_enable. Solo lectura.

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const { rows: tables } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  console.log('=== Row counts por tabla ===');
  let totalRows = 0;
  for (const { table_name } of tables) {
    const { rows: countRow } = await client.query(
      `SELECT COUNT(*)::int AS n FROM "${table_name}"`,
    );
    const n = countRow[0].n;
    totalRows += n;
    console.log(`  ${n.toString().padStart(6)}  ${table_name}`);
  }
  console.log(`---------- TOTAL filas: ${totalRows} ----------`);
  console.log('');

  console.log('=== Definición de rls_auto_enable ===');
  const { rows: funcDef } = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable';
  `);
  if (funcDef.length === 0) {
    console.log('(no encontrada)');
  } else {
    console.log(funcDef[0].def);
  }
  console.log('');

  console.log('=== Triggers que usan rls_auto_enable ===');
  const { rows: triggers } = await client.query(`
    SELECT trigger_name, event_object_table, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE action_statement ILIKE '%rls_auto_enable%';
  `);
  if (triggers.length === 0) {
    console.log('(no hay triggers que la disparen)');
  } else {
    for (const t of triggers) {
      console.log(`  ${t.trigger_name} ON ${t.event_object_table} (${t.event_manipulation})`);
      console.log(`     ${t.action_statement}`);
    }
  }
  console.log('');

  console.log('=== Event triggers (DDL) que usan rls_auto_enable ===');
  const { rows: evtTrigs } = await client.query(`
    SELECT evtname, evtevent, evtenabled
    FROM pg_event_trigger
    WHERE evtfoid = (SELECT oid FROM pg_proc WHERE proname='rls_auto_enable');
  `);
  if (evtTrigs.length === 0) {
    console.log('(no hay event triggers DDL conectados)');
  } else {
    for (const e of evtTrigs) {
      console.log(`  ${e.evtname}  event=${e.evtevent}  enabled=${e.evtenabled}`);
    }
  }
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
