// scripts/test-rls-cerebro.mjs
// Verificación de la RLS del Cerebro (apps/panel/src/lib/actions/cerebro.ts) SIN
// tocar el panel y SIN password. Impersona usuarios reales a nivel SQL
// (set_config('request.jwt.claims') + SET LOCAL ROLE authenticated). Todo en
// BEGIN…ROLLBACK → cero cambios persistentes. Comprueba:
//
//   1. READS — las tres tablas del Cerebro son ADMIN-ONLY (06-agent-sys.sql +
//      09-pipeline.sql): admin ve los bloques (>0) y las columnas que leen las
//      acciones existen; un NO-admin (comercial y, sobre todo, director_general —
//      la trampa: rol alto pero ≠ admin) ve 0 filas en prompt_blocks /
//      prompt_block_versions / prompt_block_drafts.
//   2. DRAFTS — autosave del editor (prompt_block_drafts modify FOR ALL admin):
//      admin INSERT→UPDATE→DELETE (mismo tx) allow; no-admin INSERT deny (42501).
//   3. VERSIONS — snapshot del publish (migración 016: INSERT admin habilitado):
//      admin INSERT de versión para un bloque visible allow; no-admin deny;
//      admin con prompt_block_id inexistente deny (WITH CHECK subquery vacío).
//   4. PUBLISH simulado (admin, 1 tx): INSERT versión (v+1) + UPDATE prompt_blocks
//      → ambos afectan fila; no-admin: UPDATE prompt_blocks deny (0 filas).
//
// `expectWrite` trata rowCount===0 como DENY (RLS de UPDATE con USING falso no
// lanza 42501) y 42501 como DENY (WITH CHECK de INSERT).
//
// REQUIERE la migración 016 aplicada (sin ella, los INSERT de versión por admin
// fallan → es el control negativo de que 016 es la que habilita el publish).
//
// Uso: node scripts/test-rls-cerebro.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const BLOCK_COLS =
  'id, tenant_id, block_key, content, sort_order, is_active, version, created_at, updated_at';
const VERSION_COLS =
  'id, prompt_block_id, version_number, content, changed_by, changed_at, change_summary, was_applied';
const DRAFT_COLS =
  'id, block_key, tenant_id, content, base_version, owner_user_id, created_at, updated_at';

const PROMPT_TABLES = [
  ['prompt_blocks', BLOCK_COLS],
  ['prompt_block_versions', VERSION_COLS],
  ['prompt_block_drafts', DRAFT_COLS],
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
let failures = 0;
const log = (s) => console.log(s);
const check = (ok, msg) => {
  if (!ok) failures++;
  log(`      ${ok ? '✓' : '✗✗'} ${msg}`);
};

async function txAs(authUserId, fn) {
  await client.query('BEGIN');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUserId, role: 'authenticated' }),
  ]);
  await client.query('SET LOCAL ROLE authenticated');
  try {
    return await fn();
  } finally {
    await client.query('ROLLBACK').catch(() => {});
  }
}

async function expectWrite(authUserId, name, expect, sql, params) {
  let err = null;
  let rowCount = null;
  await txAs(authUserId, async () => {
    try {
      const res = await client.query(sql, params);
      rowCount = res.rowCount;
    } catch (e) {
      err = e;
    }
  });
  const denied = (err && err.code === '42501') || (!err && rowCount === 0);
  const otherErr = err && err.code !== '42501';
  let ok;
  if (otherErr) ok = false;
  else if (expect === 'allow') ok = !err && rowCount !== null && rowCount > 0;
  else ok = denied;
  if (!ok) failures++;
  const how = err && err.code === '42501' ? 'DENEGADO 42501' : err ? `[${err.code}]` : `${rowCount} fila(s)`;
  log(`      ${ok ? '✓' : '✗✗'} ${name} (esperado: ${expect}) → ${how}`);
}

async function countAs(authUserId, table) {
  return txAs(authUserId, async () => {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
    return rows[0].n;
  });
}

const INSERT_DRAFT =
  `INSERT INTO public.prompt_block_drafts (block_key, tenant_id, content, base_version, owner_user_id) VALUES ($1, NULL, $2, $3, $4)`;
const INSERT_VERSION =
  `INSERT INTO public.prompt_block_versions (prompt_block_id, version_number, content, changed_by, change_summary, was_applied) VALUES ($1, $2, $3, $4, $5, true)`;
const UPDATE_BLOCK = `UPDATE public.prompt_blocks SET content = content WHERE id = $1`;

try {
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT DISTINCT ON (role) id, auth_user_id, tenant_id, role, full_name
       FROM public.users WHERE active = true ORDER BY role, id`,
  );
  const byRole = Object.fromEntries(users.map((u) => [u.role, u]));
  const admin = byRole.admin;
  const com = byRole.comercial;
  const dg = byRole.director_general;
  if (!admin) throw new Error('seed sin admin');

  // Bloque diana (raw client = owner, bypassa RLS).
  const { rows: blocks } = await client.query(
    'SELECT id, version, block_key, tenant_id FROM public.prompt_blocks ORDER BY id LIMIT 1',
  );
  const block = blocks[0];
  if (!block) throw new Error('seed sin prompt_blocks — ¿se aplicó el seed de F4?');
  log(`\nBloque diana: id=${block.id} key=${block.block_key} version=${block.version} tenant=${block.tenant_id ?? 'NULL(shared)'}`);

  // --- 1) READS: admin ve; no-admin (comercial, director_general) NO ---
  log(`\n=== 1) READS · las 3 tablas del Cerebro son admin-only ===`);
  for (const [table, cols] of PROMPT_TABLES) {
    try {
      const n = await txAs(admin.auth_user_id, async () => {
        await client.query(`SELECT ${cols} FROM public.${table} LIMIT 1`);
        const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
        return rows[0].n;
      });
      log(`      ✓ admin · ${table}: columnas OK · ${n} filas visibles`);
    } catch (err) {
      failures++;
      log(`      ✗✗ admin · ${table}: [${err.code}] ${err.message.split('\n')[0]}`);
    }
  }
  for (const u of [com, dg].filter(Boolean)) {
    for (const [table] of PROMPT_TABLES) {
      const n = await countAs(u.auth_user_id, table);
      check(n === 0, `${u.role} · ${table}: ${n} filas (esperado 0 — admin-only)`);
    }
  }

  // --- 2) DRAFTS: lifecycle admin (1 tx) + deny no-admin ---
  log(`\n=== 2) DRAFTS (prompt_block_drafts) ===`);
  await txAs(admin.auth_user_id, async () => {
    const ins = await client.query(INSERT_DRAFT, [block.block_key, 'borrador de prueba', block.version, admin.id]);
    check(ins.rowCount === 1, `admin INSERT draft → ${ins.rowCount} fila(s) (allow)`);
    const upd = await client.query(
      `UPDATE public.prompt_block_drafts SET content = $1 WHERE block_key = $2 AND owner_user_id = $3 AND tenant_id IS NULL`,
      ['borrador editado', block.block_key, admin.id],
    );
    check(upd.rowCount === 1, `admin UPDATE su draft → ${upd.rowCount} fila(s) (allow)`);
    const del = await client.query(
      `DELETE FROM public.prompt_block_drafts WHERE block_key = $1 AND owner_user_id = $2 AND tenant_id IS NULL`,
      [block.block_key, admin.id],
    );
    check(del.rowCount === 1, `admin DELETE su draft → ${del.rowCount} fila(s) (allow)`);
  });
  for (const u of [com, dg].filter(Boolean)) {
    await expectWrite(u.auth_user_id, `${u.role} INSERT draft (deny: WITH CHECK)`, 'deny', INSERT_DRAFT, [
      block.block_key,
      'no permitido',
      block.version,
      u.id,
    ]);
  }

  // --- 3) VERSIONS: snapshot del publish (migración 016) ---
  log(`\n=== 3) VERSIONS (prompt_block_versions · migración 016) ===`);
  await expectWrite(admin.auth_user_id, 'admin INSERT versión bloque visible (allow)', 'allow', INSERT_VERSION, [
    block.id,
    block.version + 1,
    'contenido publicado',
    admin.id,
    'test publish',
  ]);
  await expectWrite(admin.auth_user_id, 'admin INSERT versión prompt_block_id inexistente (deny: WITH CHECK)', 'deny', INSERT_VERSION, [
    999999999,
    1,
    'x',
    admin.id,
    'bogus',
  ]);
  for (const u of [com, dg].filter(Boolean)) {
    await expectWrite(u.auth_user_id, `${u.role} INSERT versión (deny: sin policy)`, 'deny', INSERT_VERSION, [
      block.id,
      block.version + 1,
      'x',
      u.id,
      'no permitido',
    ]);
  }

  // --- 4) prompt_blocks UPDATE: admin allow; no-admin deny (0 filas) ---
  log(`\n=== 4) prompt_blocks UPDATE (publish leg) ===`);
  await expectWrite(admin.auth_user_id, 'admin UPDATE prompt_blocks (allow)', 'allow', UPDATE_BLOCK, [block.id]);
  for (const u of [com, dg].filter(Boolean)) {
    await expectWrite(u.auth_user_id, `${u.role} UPDATE prompt_blocks (deny: 0 filas)`, 'deny', UPDATE_BLOCK, [block.id]);
  }

  // --- Publish simulado (admin, 1 tx): versión nueva + update del bloque ---
  log(`\n=== publish simulado (admin, 1 tx) ===`);
  await txAs(admin.auth_user_id, async () => {
    const v = await client.query(INSERT_VERSION, [block.id, block.version + 1, 'publicado', admin.id, 'sim']);
    const b = await client.query(
      `UPDATE public.prompt_blocks SET content = $1, version = $2 WHERE id = $3`,
      ['publicado', block.version + 1, block.id],
    );
    check(v.rowCount === 1 && b.rowCount === 1, `INSERT versión (${v.rowCount}) + UPDATE bloque (${b.rowCount}) → ambos allow`);
  });

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓ (todas las expectativas se cumplen)' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
