// scripts/test-rls-members-writes.mjs
// Verificación de la RLS de escritura para la gestión de miembros (F9 /settings/members
// + setAgencyAdmin). SIN tocar el panel. Impersona a nivel SQL + BEGIN…ROLLBACK.
//
//   · users UPDATE (rol/activo/is_agency_admin): admin/director_general allow;
//     director_oficina/comercial deny (0 filas — users_update USING admin/dg).
//   · user_office_assignments DELETE/INSERT: admin/dg allow; comercial deny.
//
// Los guards de app (no degradar último admin, no auto-desactivarte) son JS, no RLS
// → se cubren en la verificación de S10. Aquí solo la frontera RLS.
//
// Uso: node scripts/test-rls-members-writes.mjs

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
  const denied = (err && err.code === '42501') || (!err && rowCount === 0);
  const otherErr = err && err.code !== '42501' && err.code !== '23505';
  let ok;
  if (otherErr) ok = false;
  else if (expect === 'allow') ok = (err && err.code === '23505') || (!err && rowCount > 0);
  else ok = denied;
  if (!ok) failures++;
  const how = err ? `[${err.code}]` : `${rowCount} fila(s)`;
  log(`      ${ok ? '✓' : '✗✗'} ${name} (esperado: ${expect}) → ${how}`);
}

const UPDATE_ROLE = `UPDATE public.users SET role = role WHERE id = $1`;
const UPDATE_ACTIVE = `UPDATE public.users SET active = active WHERE id = $1`;
const UPDATE_AGENCY = `UPDATE public.users SET is_agency_admin = is_agency_admin WHERE id = $1`;

try {
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT DISTINCT ON (role) id, auth_user_id, tenant_id, role, full_name
       FROM public.users WHERE active = true ORDER BY role, id`,
  );
  const byRole = Object.fromEntries(users.map((u) => [u.role, u]));
  const admin = byRole.admin;
  const dg = byRole.director_general;
  const dofi = byRole.director_oficina;
  const com = byRole.comercial;
  if (!admin || !com) throw new Error('seed sin admin/comercial');

  // Diana de escritura = un comercial (no-self para los managers).
  const target = com.id;

  log(`\n=== users UPDATE (rol/activo/agency) ===`);
  await expectWrite(admin.auth_user_id, 'admin UPDATE users.role allow', 'allow', UPDATE_ROLE, [target]);
  await expectWrite(admin.auth_user_id, 'admin UPDATE users.active allow', 'allow', UPDATE_ACTIVE, [target]);
  await expectWrite(admin.auth_user_id, 'admin UPDATE users.is_agency_admin allow', 'allow', UPDATE_AGENCY, [target]);
  if (dg) {
    await expectWrite(dg.auth_user_id, 'director_general UPDATE users.role allow', 'allow', UPDATE_ROLE, [target]);
  }
  if (dofi) {
    await expectWrite(dofi.auth_user_id, 'director_oficina UPDATE users.role (deny)', 'deny', UPDATE_ROLE, [target]);
  }
  await expectWrite(com.auth_user_id, 'comercial UPDATE users.role (deny)', 'deny', UPDATE_ROLE, [admin.id]);

  log(`\n=== user_office_assignments (asignar/desasignar oficina) ===`);
  // Diana = una asignación existente (raw client = owner, bypassa RLS).
  const { rows: uoa } = await client.query(
    'SELECT user_id, office_id FROM public.user_office_assignments ORDER BY id LIMIT 1',
  );
  if (uoa[0]) {
    const DEL = `DELETE FROM public.user_office_assignments WHERE user_id = $1 AND office_id = $2`;
    await expectWrite(admin.auth_user_id, 'admin DELETE asignación allow', 'allow', DEL, [uoa[0].user_id, uoa[0].office_id]);
    if (dg) {
      await expectWrite(dg.auth_user_id, 'director_general DELETE asignación allow', 'allow', DEL, [uoa[0].user_id, uoa[0].office_id]);
    }
    await expectWrite(com.auth_user_id, 'comercial DELETE asignación (deny)', 'deny', DEL, [uoa[0].user_id, uoa[0].office_id]);
  } else {
    log('      (seed sin user_office_assignments → asserts de oficina omitidos)');
  }

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓ (todas las expectativas se cumplen)' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
