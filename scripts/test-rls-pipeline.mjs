// scripts/test-rls-pipeline.mjs
// Verifica la capa de datos de F6/S4 (pipeline) y la policy nueva
// `pipeline_events_manual_insert`. SIN tocar el panel, SIN password, todo en
// BEGIN…ROLLBACK (cero persistencia). Impersona usuarios reales a nivel SQL
// (set_config('request.jwt.claims') + SET LOCAL ROLE authenticated).
//
// Comprueba:
//   1. Columnas que leen/escriben las acciones de pipeline existen (cliente untyped).
//   2. INSERT pipeline_events ACOTADO por la policy nueva:
//        · ALLOW: event_type='phase_change' + source='manual' sobre conversación visible.
//        · DENY (42501): event_type≠phase_change, source≠manual, conversación NO visible.
//   3. UPDATE conversations.current_phase (movePhase) sobre conversación visible → ALLOW.
//   4. SELECT pipeline_events sigue siendo solo admin/director_general: un comercial
//      puede INSERTAR su evento de fase pero NO leer el histórico (ni su propio insert).
//
// Uso: node scripts/test-rls-pipeline.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const READ_PROBES = [
  ['conversations', 'id, lead_id, channel, status, current_phase, ai_paused_until, is_handoff_to_human, is_unread, is_blocked, assigned_user_id, last_message_at'],
  ['pipeline_events', 'id, tenant_id, conversation_id, event_type, from_value, to_value, source, occurred_at'],
  ['tenant_labels', 'id, name, color, destination_bucket'],
  ['conversation_labels', 'conversation_id, label_id, tenant_id, applied_by, applied_via'],
];

const INSERT_EVENT =
  `INSERT INTO public.pipeline_events (tenant_id, conversation_id, event_type, from_value, to_value, source) VALUES ($1,$2,$3,$4,$5,$6)`;

const client = new Client({ connectionString: process.env.DATABASE_URL });
let failures = 0;
const log = (s) => console.log(s);
const check = (name, cond, extra = '') => {
  if (!cond) failures++;
  log(`      ${cond ? '✓' : '✗✗'} ${name}${extra ? ` → ${extra}` : ''}`);
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

/** Ejecuta una mutación y compara con la expectativa ('allow'|'deny'). */
async function expectWrite(authUserId, name, expect, sql, params) {
  let err = null;
  await txAs(authUserId, async () => {
    try {
      await client.query(sql, params);
    } catch (e) {
      err = e;
    }
  });
  const denied = err && err.code === '42501';
  const otherErr = err && err.code !== '42501' && err.code !== '23505';
  let ok;
  if (otherErr) ok = false;
  else if (expect === 'allow') ok = !err || err.code === '23505';
  else ok = denied;
  if (!ok) failures++;
  const detail = err ? `[${err.code}] ${err.message.split('\n')[0]}` : 'OK';
  log(`      ${ok ? '✓' : '✗✗'} ${name} (esperado: ${expect}) → ${denied ? 'DENEGADO 42501' : detail}`);
}

async function probeReads(authUserId, label) {
  log(`  · READS · ${label} (columnas existen + visibilidad RLS):`);
  for (const [table, cols] of READ_PROBES) {
    try {
      const n = await txAs(authUserId, async () => {
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

try {
  await client.connect();

  // --- Targets (conexión raw = bypassa RLS → ve todo) ---
  const { rows: pick } = await client.query(
    `SELECT l.assigned_to_user_id AS uid, c.id AS conv_id, c.tenant_id, c.current_phase
       FROM public.conversations c JOIN public.leads l ON l.id = c.lead_id
      WHERE l.assigned_to_user_id IS NOT NULL
      LIMIT 1`,
  );
  if (!pick[0]) throw new Error('No hay conversación con lead asignado en el seed → no se puede probar.');
  const comercialId = pick[0].uid;
  const ownConv = pick[0].conv_id;
  const tenantId = pick[0].tenant_id;
  const fromPhase = pick[0].current_phase ?? 0;

  const { rows: cu } = await client.query(
    'SELECT auth_user_id, role, full_name FROM public.users WHERE id = $1',
    [comercialId],
  );
  const comercialAuth = cu[0].auth_user_id;

  const { rows: fc } = await client.query(
    `SELECT c.id FROM public.conversations c JOIN public.leads l ON l.id = c.lead_id
      WHERE l.assigned_to_user_id IS DISTINCT FROM $1 LIMIT 1`,
    [comercialId],
  );
  const foreignConv = fc[0]?.id ?? null;

  const { rows: adm } = await client.query(
    "SELECT auth_user_id, full_name FROM public.users WHERE role = 'admin' AND active = true LIMIT 1",
  );
  const adminAuth = adm[0]?.auth_user_id ?? null;

  log(`[targets] comercial=${cu[0].full_name} (role=${cu[0].role}) ownConv=${ownConv} foreignConv=${foreignConv} tenant=${tenantId} fromPhase=${fromPhase}`);

  // --- READS ---
  if (adminAuth) await probeReads(adminAuth, `admin ${adm[0].full_name}`);
  await probeReads(comercialAuth, `comercial ${cu[0].full_name}`);

  // --- WRITES · INSERT pipeline_events acotado (comercial sobre su conversación) ---
  log(`\n=== WRITES · INSERT pipeline_events · comercial ${cu[0].full_name} ===`);
  await expectWrite(comercialAuth, 'phase_change + manual (conv visible)', 'allow',
    INSERT_EVENT, [tenantId, ownConv, 'phase_change', String(fromPhase), String(fromPhase + 1), 'manual']);
  await expectWrite(comercialAuth, 'outcome_applied + manual (event_type ≠ phase_change)', 'deny',
    INSERT_EVENT, [tenantId, ownConv, 'outcome_applied', null, 'bought', 'manual']);
  await expectWrite(comercialAuth, 'phase_change + motor (source ≠ manual)', 'deny',
    INSERT_EVENT, [tenantId, ownConv, 'phase_change', String(fromPhase), String(fromPhase + 1), 'motor']);
  if (foreignConv) {
    await expectWrite(comercialAuth, 'phase_change + manual (conv NO visible)', 'deny',
      INSERT_EVENT, [tenantId, foreignConv, 'phase_change', '1', '2', 'manual']);
  }

  // --- WRITES · movePhase (UPDATE conversations.current_phase) ---
  log(`\n=== WRITES · movePhase · comercial ${cu[0].full_name} ===`);
  await expectWrite(comercialAuth, 'UPDATE conversations.current_phase (conv visible)', 'allow',
    `UPDATE public.conversations SET current_phase = $2 WHERE id = $1`, [ownConv, fromPhase + 1]);

  // --- WRITES · gestor admin ---
  if (adminAuth) {
    log(`\n=== WRITES · INSERT pipeline_events · admin ${adm[0].full_name} ===`);
    await expectWrite(adminAuth, 'phase_change + manual (admin, conv visible)', 'allow',
      INSERT_EVENT, [tenantId, ownConv, 'phase_change', String(fromPhase), String(fromPhase + 1), 'manual']);
  }

  // --- SELECT gating: comercial inserta su evento pero NO lo lee; admin sí ---
  log(`\n=== SELECT gating pipeline_events (solo admin/director_general) ===`);
  const comercialSees = await txAs(comercialAuth, async () => {
    await client.query(INSERT_EVENT, [tenantId, ownConv, 'phase_change', String(fromPhase), String(fromPhase + 1), 'manual']);
    const { rows } = await client.query('SELECT count(*)::int AS n FROM public.pipeline_events');
    return rows[0].n;
  });
  check('comercial NO lee pipeline_events (ni su propio insert)', comercialSees === 0, `vio ${comercialSees} filas`);

  if (adminAuth) {
    const adminSees = await txAs(adminAuth, async () => {
      await client.query(INSERT_EVENT, [tenantId, ownConv, 'phase_change', String(fromPhase), String(fromPhase + 1), 'manual']);
      const { rows } = await client.query('SELECT count(*)::int AS n FROM public.pipeline_events');
      return rows[0].n;
    });
    check('admin SÍ lee pipeline_events (ve su insert en la tx)', adminSees >= 1, `vio ${adminSees} filas`);
  }

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓ (todas las expectativas se cumplen)' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
