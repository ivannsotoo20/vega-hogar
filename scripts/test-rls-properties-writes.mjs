// scripts/test-rls-properties-writes.mjs
// Verificación de la capa de datos de F7 (apps/panel/src/lib/actions/properties.ts)
// SIN tocar el panel y SIN password. Impersona usuarios reales a nivel SQL
// (set_config('request.jwt.claims') + SET LOCAL ROLE authenticated). Todo en
// BEGIN…ROLLBACK → cero cambios persistentes. Comprueba:
//
//   1. READS — columnas que leen las acciones existen (cliente untyped) + la
//      frontera de visibilidad: property_owners es invisible para `comercial`.
//   2. WRITES por rol (RLS de Fase 1 + matriz + guard de soft-delete de F7):
//        · properties: INSERT/UPDATE/archive = admin/dg/director_oficina; el
//          guard (trigger 014) bloquea modificar deleted_at salvo admin (42501);
//          DELETE físico = admin.
//        · property_photos: ALL = admin/dg/director_oficina/comercial (NO asistente).
//        · property_owners: ALL = admin/dg/director_oficina/asistente_captador (NO comercial).
//        · lead_property_interest: delega a leads (comercial puede sobre su lead).
//
// `expectWrite` trata rowCount===0 como DENY (hallazgo F6): la RLS de UPDATE/DELETE
// con USING falso no lanza 42501, simplemente no afecta filas.
//
// Uso: node scripts/test-rls-properties-writes.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const READ_PROBES = [
  ['properties', 'id, tenant_id, office_id, type, status, title, description, price_eur, monthly_rent_eur, m2_built, m2_useful, rooms, bathrooms, year_built, neighborhood, address_short, features, assigned_to_user_id, created_at, updated_at'],
  ['property_photos', 'id, property_id, url, caption, sort_order'],
  ['property_owners', 'id, property_id, full_name, phone, email, notes, created_at, updated_at'],
  ['lead_property_interest', 'id, lead_id, property_id, status, notes, created_at, updated_at'],
  ['leads', 'id, full_name, phone, intent, status, assigned_to_user_id'],
  ['offices', 'id, name, slug'],
  ['users', 'id, active'],
];

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
  // Deny: 42501 (INSERT WITH CHECK / trigger) o 0 filas (UPDATE/DELETE con USING falso).
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

async function probeReads(u) {
  log('  · READS (columnas existen + visibilidad RLS):');
  for (const [table, cols] of READ_PROBES) {
    try {
      const n = await txAs(u.auth_user_id, async () => {
        await client.query(`SELECT ${cols} FROM public.${table} LIMIT 1`);
        const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
        return rows[0].n;
      });
      log(`      ✓ ${table}: columnas OK · ${n} filas visibles`);
    } catch (err) {
      failures++;
      log(`      ✗✗ ${table}: [${err.code}] ${err.message.split('\n')[0]}`);
    }
  }
}

async function countAs(authUserId, table) {
  return txAs(authUserId, async () => {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
    return rows[0].n;
  });
}

const INSERT_PROPERTY =
  `INSERT INTO public.properties (tenant_id, office_id, type, status, title, m2_built, neighborhood) VALUES ($1, $2, 'sale', 'available', 'Probe RLS (rollback)', 80, 'ruzafa')`;
const INSERT_PHOTO =
  `INSERT INTO public.property_photos (tenant_id, property_id, url, caption, sort_order) VALUES ($1, $2, 'https://example.com/probe.jpg', 'probe', 99)`;
const INSERT_OWNER =
  `INSERT INTO public.property_owners (tenant_id, property_id, full_name) VALUES ($1, $2, 'Probe Owner (rollback)')`;
const INSERT_INTEREST =
  `INSERT INTO public.lead_property_interest (tenant_id, lead_id, property_id, status) VALUES ($1, $2, $3, 'interested')`;
const SOFTDELETE = `UPDATE public.properties SET deleted_at = now() WHERE id = $1`;
const UPDATE_TITLE = `UPDATE public.properties SET title = title WHERE id = $1`;
const DELETE_PROP = `DELETE FROM public.properties WHERE id = $1`;

try {
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT DISTINCT ON (role) id, auth_user_id, tenant_id, role, full_name
       FROM public.users WHERE active = true ORDER BY role, id`,
  );
  const byRole = Object.fromEntries(users.map((u) => [u.role, u]));

  // Targets globales (raw client → owner, bypassa RLS).
  const { rows: props } = await client.query(
    'SELECT id, tenant_id, office_id FROM public.properties WHERE deleted_at IS NULL ORDER BY id LIMIT 1',
  );
  const prop = props[0];
  if (!prop) throw new Error('seed sin properties — ¿se aplicó el seed de F1?');
  const tenantId = prop.tenant_id;
  const officeId = prop.office_id;
  const propId = prop.id;

  const com = byRole.comercial;
  const { rows: comLeads } = com
    ? await client.query('SELECT id FROM public.leads WHERE assigned_to_user_id = $1 LIMIT 1', [com.id])
    : { rows: [] };
  const comLeadId = comLeads[0]?.id ?? null;

  // --- READS admin + comercial ---
  for (const role of ['admin', 'comercial']) {
    const u = byRole[role];
    if (!u) continue;
    log(`\n=== READS · ${role} · ${u.full_name} ===`);
    await probeReads(u);
  }

  // --- Frontera de propietarios: comercial NO ve owners ---
  log('\n=== property_owners: frontera de visibilidad por rol ===');
  if (byRole.admin && com) {
    const adminN = await countAs(byRole.admin.auth_user_id, 'property_owners');
    const comN = await countAs(com.auth_user_id, 'property_owners');
    const ok = adminN > 0 && comN === 0;
    if (!ok) failures++;
    log(`      ${ok ? '✓' : '✗✗'} admin ve ${adminN} · comercial ve ${comN} (esperado: admin>0, comercial=0)`);
  }

  // --- WRITES gestor (director_oficina) ---
  const dofi = byRole.director_oficina;
  if (dofi) {
    log(`\n=== WRITES · gestor director_oficina · ${dofi.full_name} ===`);
    await expectWrite(dofi.auth_user_id, 'createProperty (INSERT)', 'allow', INSERT_PROPERTY, [tenantId, officeId]);
    await expectWrite(dofi.auth_user_id, 'updateProperty (UPDATE título)', 'allow', UPDATE_TITLE, [propId]);
    await expectWrite(dofi.auth_user_id, 'addPropertyPhoto (INSERT)', 'allow', INSERT_PHOTO, [tenantId, propId]);
    await expectWrite(dofi.auth_user_id, 'addPropertyOwner (INSERT)', 'allow', INSERT_OWNER, [tenantId, propId]);
    await expectWrite(dofi.auth_user_id, 'GUARD: soft-delete (UPDATE deleted_at) — no admin', 'deny', SOFTDELETE, [propId]);
  }

  // --- WRITES admin (soft-delete + delete físico permitidos) ---
  const admin = byRole.admin;
  if (admin) {
    log(`\n=== WRITES · admin · ${admin.full_name} ===`);
    await expectWrite(admin.auth_user_id, 'GUARD: soft-delete (UPDATE deleted_at)', 'allow', SOFTDELETE, [propId]);
    await expectWrite(admin.auth_user_id, 'deleteProperty físico (DELETE)', 'allow', DELETE_PROP, [propId]);
  }

  // --- WRITES comercial (deny + frontera) ---
  if (com) {
    log(`\n=== WRITES · comercial · ${com.full_name} ===`);
    await expectWrite(com.auth_user_id, 'createProperty (INSERT)', 'deny', INSERT_PROPERTY, [com.tenant_id, officeId]);
    await expectWrite(com.auth_user_id, 'addPropertyOwner (INSERT) — fuera del set RLS', 'deny', INSERT_OWNER, [com.tenant_id, propId]);
    await expectWrite(com.auth_user_id, 'GUARD: soft-delete (UPDATE deleted_at)', 'deny', SOFTDELETE, [propId]);
    await expectWrite(com.auth_user_id, 'deleteProperty físico (DELETE) — RLS admin-only', 'deny', DELETE_PROP, [propId]);
    await expectWrite(com.auth_user_id, 'updateProperty título (RLS permite; app gatea a do+)', 'allow', UPDATE_TITLE, [propId]);
    if (comLeadId) {
      await expectWrite(com.auth_user_id, 'addPropertyInterest sobre SU lead (RLS delega a leads)', 'allow', INSERT_INTEREST, [com.tenant_id, comLeadId, propId]);
    } else {
      log('      (comercial sin lead asignado visible → interest omitido)');
    }
  }

  // --- WRITES asistente_captador (owners sí, fotos no) ---
  const asis = byRole.asistente_captador;
  if (asis) {
    log(`\n=== WRITES · asistente_captador · ${asis.full_name} ===`);
    await expectWrite(asis.auth_user_id, 'addPropertyOwner (INSERT) — dentro del set RLS', 'allow', INSERT_OWNER, [asis.tenant_id, propId]);
    await expectWrite(asis.auth_user_id, 'addPropertyPhoto (INSERT) — fuera del set RLS', 'deny', INSERT_PHOTO, [asis.tenant_id, propId]);
  }

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓ (todas las expectativas se cumplen)' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
