// scripts/test-rls-labels.mjs
// Verifica la capa de datos de F6/S2 (apps/panel/src/lib/actions/labels.ts) — CRUD
// de tenant_labels. SIN password, todo en BEGIN…ROLLBACK.
//
// RLS `tenant_labels_modify` = admin / director_general. SELECT = todos.
//   · admin / director_general → INSERT / UPDATE / DELETE ALLOW.
//   · comercial → INSERT / UPDATE / DELETE DENY (42501).
//
// La protección de system labels (no borrar / no renombrar) es de capa de
// aplicación (el código), NO de RLS — aquí solo se valida el gate de rol.
//
// Uso: node scripts/test-rls-labels.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const client = new Client({ connectionString: process.env.DATABASE_URL });
let failures = 0;
const log = (s) => console.log(s);

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
  const dup = err && err.code === '23505';
  // Deny en RLS: 42501 (INSERT WITH CHECK) o 0 filas afectadas (UPDATE/DELETE con
  // USING falso → la fila es invisible para la mutación, sin error).
  const denied = (err && err.code === '42501') || (!err && rowCount === 0);
  const otherErr = err && err.code !== '42501' && err.code !== '23505';
  let ok;
  if (otherErr) ok = false;
  else if (expect === 'allow') ok = dup || (!err && rowCount !== null && rowCount > 0);
  else ok = denied;
  if (!ok) failures++;
  const how = err && err.code === '42501' ? 'DENEGADO 42501' : err ? `[${err.code}]` : `${rowCount} fila(s)`;
  log(`      ${ok ? '✓' : '✗✗'} ${name} (esperado: ${expect}) → ${how}`);
}

const INSERT_LABEL =
  `INSERT INTO public.tenant_labels (tenant_id, name, color, is_system) VALUES ($1, 'Probe RLS (rollback)', '#5c6f44', false)`;

try {
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT DISTINCT ON (role) id, auth_user_id, tenant_id, role, full_name
       FROM public.users WHERE active = true ORDER BY role, id`,
  );
  const byRole = Object.fromEntries(users.map((u) => [u.role, u]));
  const { rows: anyLabel } = await client.query('SELECT id, tenant_id FROM public.tenant_labels LIMIT 1');
  const labelId = anyLabel[0]?.id ?? null;
  const tenantId = anyLabel[0]?.tenant_id ?? 1;

  // READS (todos ven el catálogo).
  log('=== READS tenant_labels (catálogo visible a todos) ===');
  for (const role of ['admin', 'comercial']) {
    const u = byRole[role];
    if (!u) continue;
    try {
      const n = await txAs(u.auth_user_id, async () => {
        await client.query(
          'SELECT id, name, color, description, destination_bucket, is_system, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to, created_at, updated_at FROM public.tenant_labels LIMIT 1',
        );
        const { rows } = await client.query('SELECT count(*)::int AS n FROM public.tenant_labels');
        return rows[0].n;
      });
      log(`      ✓ ${role}: columnas OK · ${n} etiquetas visibles`);
    } catch (e) {
      failures++;
      log(`      ✗✗ ${role}: [${e.code}] ${e.message.split('\n')[0]}`);
    }
  }

  // WRITES gestores (admin + director_general) → ALLOW.
  for (const role of ['admin', 'director_general']) {
    const u = byRole[role];
    if (!u) continue;
    log(`\n=== WRITES · gestor ${role} · ${u.full_name} ===`);
    await expectWrite(u.auth_user_id, 'createLabel (INSERT)', 'allow', INSERT_LABEL, [u.tenant_id]);
    if (labelId) {
      await expectWrite(u.auth_user_id, 'updateLabel (UPDATE color)', 'allow',
        `UPDATE public.tenant_labels SET color='#7f8c4e', updated_at=now() WHERE id=$1`, [labelId]);
      await expectWrite(u.auth_user_id, 'deleteLabel (DELETE)', 'allow',
        `DELETE FROM public.tenant_labels WHERE id=$1`, [labelId]);
    }
  }

  // WRITES comercial → DENY.
  const com = byRole.comercial;
  if (com) {
    log(`\n=== WRITES · comercial ${com.full_name} (debe DENEGAR) ===`);
    await expectWrite(com.auth_user_id, 'createLabel (INSERT)', 'deny', INSERT_LABEL, [com.tenant_id]);
    if (labelId) {
      await expectWrite(com.auth_user_id, 'updateLabel (UPDATE)', 'deny',
        `UPDATE public.tenant_labels SET color='#000000' WHERE id=$1`, [labelId]);
      await expectWrite(com.auth_user_id, 'deleteLabel (DELETE)', 'deny',
        `DELETE FROM public.tenant_labels WHERE id=$1`, [labelId]);
    }
  }

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
