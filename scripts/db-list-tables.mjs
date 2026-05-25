// scripts/db-list-tables.mjs
// Lista las tablas, vistas, funciones y secuencias del schema `public` de Supabase.
// Solo lectura. No modifica nada.
//
// Uso: node scripts/db-list-tables.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const { Client } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('FATAL: DATABASE_URL no definida en .env.local');
  process.exit(1);
}

const client = new Client({ connectionString: url });

try {
  await client.connect();

  const { rows: ping } = await client.query('SELECT 1 AS ok');
  console.log(`[ping] SELECT 1 → ${JSON.stringify(ping[0])}`);
  console.log('');

  const { rows: tables } = await client.query(`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);

  if (tables.length === 0) {
    console.log('[public] No hay tablas/vistas en el schema public.');
  } else {
    console.log(`[public] ${tables.length} tablas/vistas encontradas:`);
    for (const t of tables) {
      console.log(`  - ${t.table_name}  (${t.table_type})`);
    }
  }
  console.log('');

  const { rows: funcs } = await client.query(`
    SELECT routine_name, routine_type
    FROM information_schema.routines
    WHERE routine_schema = 'public'
    ORDER BY routine_name;
  `);
  if (funcs.length === 0) {
    console.log('[public] No hay funciones/procedimientos en el schema public.');
  } else {
    console.log(`[public] ${funcs.length} funciones/procedimientos:`);
    for (const f of funcs) {
      console.log(`  - ${f.routine_name}  (${f.routine_type})`);
    }
  }
  console.log('');

  const { rows: seqs } = await client.query(`
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
    ORDER BY sequence_name;
  `);
  if (seqs.length === 0) {
    console.log('[public] No hay secuencias en el schema public.');
  } else {
    console.log(`[public] ${seqs.length} secuencias:`);
    for (const s of seqs) {
      console.log(`  - ${s.sequence_name}`);
    }
  }
  console.log('');

  const { rows: enums } = await client.query(`
    SELECT t.typname AS enum_name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typtype = 'e' AND n.nspname = 'public'
    ORDER BY t.typname;
  `);
  if (enums.length === 0) {
    console.log('[public] No hay enums en el schema public.');
  } else {
    console.log(`[public] ${enums.length} enums:`);
    for (const e of enums) {
      console.log(`  - ${e.enum_name}`);
    }
  }
} catch (err) {
  console.error('FATAL connecting to Supabase:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
