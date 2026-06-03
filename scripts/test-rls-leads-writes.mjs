// scripts/test-rls-leads-writes.mjs
// Verificación de la capa de datos de F5/S2 (apps/panel/src/lib/actions/leads.ts)
// SIN tocar el panel y SIN password. Impersona usuarios reales a nivel SQL
// (set_config('request.jwt.claims') + SET LOCAL ROLE authenticated). Comprueba:
//
//   1. READS — todas las columnas que leen las acciones existen en la BD real
//      (el cliente Supabase del panel es untyped → un typo solo fallaría en runtime).
//   2. WRITES (todo en BEGIN…ROLLBACK → cero cambios persistentes), según el
//      modelo de autorización de S2 ("solo gestores" + RLS):
//        · gestor (director_oficina+) PUEDE editar datos maestros y (re)asignar.
//        · miembro (comercial) PUEDE pausar IA, etiquetar y notar sus leads.
//        · DEFENSA EN PROFUNDIDAD: aunque la app ya bloquea a un comercial de
//          assignLead, la RLS además le impide reasignar un lead a OTRO usuario
//          (42501) — solo puede mantenerlo asignado a sí mismo. Esto se ESPERA
//          y cuenta como PASS.
//
// Uso: node scripts/test-rls-leads-writes.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const READ_PROBES = [
  ['leads', 'id, full_name, phone, email, location, intent, status, current_phase, assigned_to_user_id, external_id, source_notes, last_message_at, created_at'],
  ['conversations', 'id, lead_id, channel, status, current_phase, is_qualified, is_handoff_to_human, is_blocked, ai_paused_until, last_message_at'],
  ['conversation_labels', 'conversation_id, label_id'],
  ['tenant_labels', 'id, name, color, destination_bucket, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to'],
  ['lead_preferences', 'type, neighborhoods, price_min_eur, price_max_eur, rooms_min, m2_min, features_required, urgency, motives'],
  ['lead_property_interest', 'property_id, status, notes'],
  ['properties', 'id, title, type, status, price_eur, monthly_rent_eur, m2_built, rooms, neighborhood'],
  ['pipeline_events', 'id, conversation_id, event_type, from_value, to_value, source, occurred_at'],
  ['conversation_notes', 'id, conversation_id, content, author_email, created_at'],
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

/** Ejecuta una mutación y compara el resultado con la expectativa ('allow'|'deny'). */
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
  const otherErr = err && err.code !== '42501' && err.code !== '23505'; // 23505 = ya existía → RLS pasó
  let ok;
  if (otherErr) ok = false;
  else if (expect === 'allow') ok = !err || err.code === '23505';
  else ok = denied; // expect 'deny'
  if (!ok) failures++;
  const detail = err ? `[${err.code}]` : 'OK';
  log(`      ${ok ? '✓' : '✗✗'} ${name} (esperado: ${expect}) → ${denied ? 'DENEGADO 42501' : detail}`);
}

async function pickTargets(authUserId, selfId) {
  return txAs(authUserId, async () => {
    const { rows: leadConv } = await client.query(
      `SELECT l.id AS lead_id,
              (SELECT c.id FROM public.conversations c WHERE c.lead_id = l.id LIMIT 1) AS conv_id
         FROM public.leads l
        WHERE EXISTS (SELECT 1 FROM public.conversations c WHERE c.lead_id = l.id)
        LIMIT 1`,
    );
    const { rows: anyLead } = await client.query('SELECT id FROM public.leads LIMIT 1');
    const { rows: label } = await client.query('SELECT id FROM public.tenant_labels LIMIT 1');
    const { rows: other } = await client.query('SELECT id FROM public.users WHERE id <> $1 LIMIT 1', [selfId]);
    const { rows: tenant } = await client.query('SELECT tenant_id FROM public.users WHERE id = $1', [selfId]);
    return {
      leadWithConv: leadConv[0]?.lead_id ?? null,
      convId: leadConv[0]?.conv_id ?? null,
      anyLead: anyLead[0]?.id ?? null,
      labelId: label[0]?.id ?? null,
      otherUserId: other[0]?.id ?? null,
      tenantId: tenant[0]?.tenant_id ?? null,
    };
  });
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
      log(`      ✗✗ ${table}: [${err.code}] ${err.message}`);
    }
  }
}

try {
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT DISTINCT ON (role) id, auth_user_id, tenant_id, role, full_name
       FROM public.users WHERE active = true ORDER BY role, id`,
  );
  const byRole = Object.fromEntries(users.map((u) => [u.role, u]));

  // --- READS para admin + comercial (cubre todas las columnas) ---
  for (const role of ['admin', 'comercial']) {
    const u = byRole[role];
    if (!u) continue;
    log(`\n=== READS · ${role} · ${u.full_name} ===`);
    await probeReads(u);
  }

  // --- WRITES: gestor (director_oficina, el rol más bajo que asigna/edita) ---
  const dofi = byRole.director_oficina;
  if (dofi) {
    log(`\n=== WRITES · gestor director_oficina · ${dofi.full_name} ===`);
    const t = await pickTargets(dofi.auth_user_id, dofi.id);
    if (t.anyLead && t.otherUserId) {
      await expectWrite(dofi.auth_user_id, 'updateLead (datos maestros)', 'allow',
        `UPDATE public.leads SET full_name=full_name, phone=phone, email=email, intent=intent, location=location WHERE id=$1`, [t.anyLead]);
      await expectWrite(dofi.auth_user_id, 'assignLead → OTRO usuario', 'allow',
        `UPDATE public.leads SET assigned_to_user_id=$2 WHERE id=$1`, [t.anyLead, t.otherUserId]);
    } else log('      (sin lead/usuario destino visibles → omitido)');
  }

  // --- WRITES: miembro (comercial) ---
  const com = byRole.comercial;
  if (com) {
    log(`\n=== WRITES · miembro comercial · ${com.full_name} ===`);
    const t = await pickTargets(com.auth_user_id, com.id);
    if (t.leadWithConv && t.convId) {
      await expectWrite(com.auth_user_id, "togglePauseLead (ai_paused_until='infinity')", 'allow',
        `UPDATE public.conversations SET ai_paused_until='infinity' WHERE lead_id=$1`, [t.leadWithConv]);
      await expectWrite(com.auth_user_id, 'applyLeadLabel (INSERT conversation_labels)', 'allow',
        `INSERT INTO public.conversation_labels (conversation_id, label_id, tenant_id, applied_by, applied_via) VALUES ($1,$2,$3,$4,'manual')`,
        [t.convId, t.labelId, t.tenantId, com.id]);
      await expectWrite(com.auth_user_id, 'addLeadNote (INSERT conversation_notes)', 'allow',
        `INSERT INTO public.conversation_notes (conversation_id, tenant_id, content, author_user_id, author_email) VALUES ($1,$2,'probe (rollback)',$3,'probe@vega.test')`,
        [t.convId, t.tenantId, com.id]);
    } else log('      (comercial sin lead con conversación → writes de conv omitidos)');
    // Defensa en profundidad: la RLS impide al comercial reasignar a otro.
    if (t.leadWithConv && t.otherUserId) {
      await expectWrite(com.auth_user_id, 'DEFENSA: comercial reasigna a OTRO', 'deny',
        `UPDATE public.leads SET assigned_to_user_id=$2 WHERE id=$1`, [t.leadWithConv, t.otherUserId]);
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
