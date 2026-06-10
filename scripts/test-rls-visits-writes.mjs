// scripts/test-rls-visits-writes.mjs
// Verificación de la capa de datos de F8 (apps/panel/src/lib/actions/visits.ts)
// SIN tocar el panel y SIN password. Impersona usuarios reales a nivel SQL
// (set_config('request.jwt.claims') + SET LOCAL ROLE authenticated). Todo en
// BEGIN…ROLLBACK → cero cambios persistentes. Comprueba:
//
//   1. READS — columnas que leen las acciones existen (cliente untyped) + la
//      frontera de visibilidad RLS (05-visits.sql):
//        · admin / director_general / asistente_captador → TODAS las visitas.
//        · comercial → SOLO las suyas (comercial_user_id = su users.id).
//        · director_oficina → las de los comerciales de su oficina.
//   2. WRITES por rol (tras migración 015: INSERT/UPDATE/DELETE scoped IGUAL que
//      visits_select — admin/dg/asistente todas; do su oficina; comercial las suyas):
//        · INSERT propio = allow; INSERT asignando a OTRO comercial = deny (WITH CHECK).
//        · UPDATE de SU visita = allow; UPDATE de visita AJENA = deny (0 filas, USING).
//        · La app sigue siendo la primera línea (read-before-write, reassign do+, D4c).
//
// `expectWrite` trata rowCount===0 como DENY (hallazgo F6): la RLS de UPDATE/DELETE
// con USING falso no lanza 42501, simplemente no afecta filas.
//
// Uso: node scripts/test-rls-visits-writes.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const VISIT_COLS =
  'id, tenant_id, lead_id, property_id, comercial_user_id, scheduled_for, status, outcome_notes, lead_feedback, is_tasation, calendar_appointment_id, created_at, updated_at';

const READ_PROBES = [
  ['visits', VISIT_COLS],
  ['leads', 'id, full_name, phone, intent'],
  ['properties', 'id, title, neighborhood'],
  ['users', 'id, full_name, email'],
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

const INSERT_VISIT =
  `INSERT INTO public.visits (tenant_id, lead_id, comercial_user_id, scheduled_for, status, is_tasation) VALUES ($1, $2, $3, now(), 'scheduled', false)`;
const UPDATE_STATUS = `UPDATE public.visits SET status = status WHERE id = $1`;

try {
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT DISTINCT ON (role) id, auth_user_id, tenant_id, role, full_name
       FROM public.users WHERE active = true ORDER BY role, id`,
  );
  const byRole = Object.fromEntries(users.map((u) => [u.role, u]));

  // Targets globales (raw client → owner, bypassa RLS).
  const { rows: visits } = await client.query(
    'SELECT id, tenant_id, lead_id, comercial_user_id FROM public.visits ORDER BY id LIMIT 1',
  );
  const visit = visits[0];
  if (!visit) throw new Error('seed sin visits — ¿se aplicó el seed de F1?');
  const tenantId = visit.tenant_id;

  const { rows: leads } = await client.query(
    'SELECT id FROM public.leads WHERE tenant_id = $1 ORDER BY id LIMIT 1',
    [tenantId],
  );
  const leadId = leads[0]?.id;
  if (!leadId) throw new Error('seed sin leads');

  // --- READS admin + comercial ---
  for (const role of ['admin', 'comercial']) {
    const u = byRole[role];
    if (!u) continue;
    log(`\n=== READS · ${role} · ${u.full_name} ===`);
    await probeReads(u);
  }

  // --- Frontera de visibilidad de visitas por rol (RLS 05-visits) ---
  log('\n=== visits: frontera de visibilidad por rol ===');
  const admin = byRole.admin;
  const com = byRole.comercial;
  const asis = byRole.asistente_captador;
  const dofi = byRole.director_oficina;

  if (admin) {
    const adminN = await countAs(admin.auth_user_id, 'visits');
    const ok = adminN > 0;
    if (!ok) failures++;
    log(`      ${ok ? '✓' : '✗✗'} admin ve ${adminN} visitas (esperado: todas, >0)`);

    if (asis) {
      const asisN = await countAs(asis.auth_user_id, 'visits');
      const ok2 = asisN === adminN;
      if (!ok2) failures++;
      log(`      ${ok2 ? '✓' : '✗✗'} asistente_captador ve ${asisN} (esperado: = admin ${adminN})`);
    }

    if (com) {
      // Propiedad RLS clave: el comercial NO ve ninguna visita ajena.
      const foreign = await txAs(com.auth_user_id, async () => {
        const { rows } = await client.query(
          'SELECT count(*)::int AS n FROM public.visits WHERE comercial_user_id <> $1',
          [com.id],
        );
        return rows[0].n;
      });
      const comN = await countAs(com.auth_user_id, 'visits');
      const ok3 = foreign === 0 && comN <= adminN;
      if (!ok3) failures++;
      log(
        `      ${ok3 ? '✓' : '✗✗'} comercial ve ${comN} (solo suyas; ajenas visibles: ${foreign}, esperado 0)`,
      );
    }

    if (dofi) {
      const dofiN = await countAs(dofi.auth_user_id, 'visits');
      log(`      · director_oficina ve ${dofiN} (sus comerciales; informativo)`);
    }
  }

  // --- WRITES: INSERT permitido a todos (RLS visits_modify) ---
  if (dofi) {
    log(`\n=== WRITES · director_oficina · ${dofi.full_name} ===`);
    await expectWrite(dofi.auth_user_id, 'createVisit (INSERT)', 'allow', INSERT_VISIT, [
      dofi.tenant_id,
      leadId,
      dofi.id,
    ]);
  }
  if (admin) {
    log(`\n=== WRITES · admin · ${admin.full_name} ===`);
    await expectWrite(admin.auth_user_id, 'createVisit (INSERT)', 'allow', INSERT_VISIT, [
      admin.tenant_id,
      leadId,
      admin.id,
    ]);
  }
  if (com) {
    log(`\n=== WRITES · comercial · ${com.full_name} ===`);
    // INSERT auto-asignada (comercial_user_id = self) → allow (WITH CHECK comercial).
    await expectWrite(com.auth_user_id, 'createVisit (INSERT) auto-asignada', 'allow', INSERT_VISIT, [
      com.tenant_id,
      leadId,
      com.id,
    ]);
    // Una visita propia del comercial para el UPDATE (si la tiene) → allow.
    const { rows: ownVisits } = await client.query(
      'SELECT id FROM public.visits WHERE comercial_user_id = $1 ORDER BY id LIMIT 1',
      [com.id],
    );
    if (ownVisits[0]) {
      await expectWrite(
        com.auth_user_id,
        'updateVisitStatus sobre SU visita',
        'allow',
        UPDATE_STATUS,
        [ownVisits[0].id],
      );
    } else {
      log('      (comercial sin visita propia → update propio omitido)');
    }
    // HARDENING (migración 015): una visita AJENA no es ni visible ni escribible.
    const { rows: foreignVisits } = await client.query(
      'SELECT id, comercial_user_id FROM public.visits WHERE comercial_user_id <> $1 ORDER BY id LIMIT 1',
      [com.id],
    );
    if (foreignVisits[0]) {
      await expectWrite(
        com.auth_user_id,
        'updateVisitStatus sobre visita AJENA (deny: USING)',
        'deny',
        UPDATE_STATUS,
        [foreignVisits[0].id],
      );
      await expectWrite(
        com.auth_user_id,
        'createVisit asignando a OTRO comercial (deny: WITH CHECK)',
        'deny',
        INSERT_VISIT,
        [com.tenant_id, leadId, foreignVisits[0].comercial_user_id],
      );
    } else {
      log('      (sin visita ajena en el seed → asserts de hardening omitidos)');
    }
  }

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓ (todas las expectativas se cumplen)' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
