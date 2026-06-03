// scripts/test-rls-gdpr.mjs
// Verificación de F5/S3 (apps/panel/src/lib/actions/gdpr.ts) SIN password.
// Impersona a nivel SQL (set_config jwt + SET LOCAL ROLE authenticated) y, todo
// en BEGIN…ROLLBACK (cero cambios persistentes):
//   1. CASCADA: como admin, DELETE del lead borra en cascada conversations,
//      messages, notes, labels, pipeline_events, preferences, property_interest
//      y visits (vía reglas FK del esquema).
//   2. GATING: leads_delete = admin/director_general. comercial y director_oficina
//      NO pueden borrar (0 filas). admin y director_general SÍ (≥1 fila).
//   3. EXPORT: como director_general (gate del export), todas las tablas que lee
//      exportLeadDataAction son legibles (sin error de columnas/permiso).
//
// Uso: node scripts/test-rls-gdpr.mjs

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

async function countChildren(leadId, convIds) {
  const convArr = convIds.length ? convIds : [-1];
  const q = async (sql, params) => (await client.query(sql, params)).rows[0].n;
  return {
    conversations: await q('SELECT count(*)::int n FROM public.conversations WHERE lead_id=$1', [leadId]),
    messages: await q('SELECT count(*)::int n FROM public.conversation_messages WHERE conversation_id = ANY($1)', [convArr]),
    notes: await q('SELECT count(*)::int n FROM public.conversation_notes WHERE conversation_id = ANY($1)', [convArr]),
    labels: await q('SELECT count(*)::int n FROM public.conversation_labels WHERE conversation_id = ANY($1)', [convArr]),
    pipeline_events: await q('SELECT count(*)::int n FROM public.pipeline_events WHERE conversation_id = ANY($1)', [convArr]),
    preferences: await q('SELECT count(*)::int n FROM public.lead_preferences WHERE lead_id=$1', [leadId]),
    property_interest: await q('SELECT count(*)::int n FROM public.lead_property_interest WHERE lead_id=$1', [leadId]),
    visits: await q('SELECT count(*)::int n FROM public.visits WHERE lead_id=$1', [leadId]),
  };
}

try {
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT DISTINCT ON (role) id, auth_user_id, role, full_name
       FROM public.users WHERE active = true ORDER BY role, id`,
  );
  const byRole = Object.fromEntries(users.map((u) => [u.role, u]));

  // ---- 1. CASCADA (admin) ----
  log('=== 1) CASCADA de borrado (admin, ROLLBACK) ===');
  const admin = byRole.admin;
  await txAs(admin.auth_user_id, async () => {
    const { rows: lr } = await client.query(
      `SELECT l.id FROM public.leads l
        WHERE EXISTS (SELECT 1 FROM public.conversations c WHERE c.lead_id = l.id) LIMIT 1`,
    );
    if (!lr[0]) { log('  (no hay lead con conversaciones en el seed)'); return; }
    const leadId = lr[0].id;
    const { rows: cr } = await client.query('SELECT id FROM public.conversations WHERE lead_id=$1', [leadId]);
    const convIds = cr.map((r) => r.id);
    const before = await countChildren(leadId, convIds);
    const del = await client.query('DELETE FROM public.leads WHERE id=$1 RETURNING id', [leadId]);
    const after = await countChildren(leadId, convIds);
    log(`  lead ${leadId} · DELETE → ${del.rowCount} fila(s)`);
    const cascadeTables = ['conversations', 'messages', 'notes', 'labels', 'pipeline_events', 'preferences', 'property_interest', 'visits'];
    let okCascade = del.rowCount === 1;
    for (const t of cascadeTables) {
      const cleared = after[t] === 0;
      if (!cleared) okCascade = false;
      log(`     ${t}: ${before[t]} → ${after[t]} ${cleared ? '✓' : '✗✗ NO BORRADO'}`);
    }
    if (!okCascade) failures++;
    log(`  → cascada ${okCascade ? 'OK ✓' : 'FALLO ✗✗'}`);
  });

  // ---- 2. GATING por rol ----
  log('\n=== 2) GATING leads_delete (admin/director_general SÍ, resto NO) ===');
  const expectDelete = {
    admin: true, director_general: true,
    director_oficina: false, comercial: false, asistente_captador: false,
  };
  for (const role of Object.keys(expectDelete)) {
    const u = byRole[role];
    if (!u) continue;
    const got = await txAs(u.auth_user_id, async () => {
      const { rows: lr } = await client.query('SELECT id FROM public.leads LIMIT 1');
      if (!lr[0]) return null;
      const del = await client.query('DELETE FROM public.leads WHERE id=$1 RETURNING id', [lr[0].id]);
      return del.rowCount;
    });
    if (got === null) { log(`  ${role}: (sin lead visible)`); continue; }
    const canDelete = got >= 1;
    const ok = canDelete === expectDelete[role];
    if (!ok) failures++;
    log(`  ${role}: borró ${got} fila(s) → ${ok ? '✓' : '✗✗'} (esperado ${expectDelete[role] ? 'SÍ' : 'NO'})`);
  }

  // ---- 3. EXPORT reads (director_general) ----
  log('\n=== 3) EXPORT lecturas (director_general) ===');
  const dg = byRole.director_general;
  const EXPORT_TABLES = ['leads', 'lead_preferences', 'lead_property_interest', 'visits',
    'conversations', 'conversation_messages', 'conversation_notes', 'conversation_labels',
    'tenant_labels', 'pipeline_events'];
  await txAs(dg.auth_user_id, async () => {
    for (const t of EXPORT_TABLES) {
      try {
        await client.query(`SELECT * FROM public.${t} LIMIT 1`);
        log(`  ✓ ${t}: legible`);
      } catch (e) {
        failures++;
        log(`  ✗✗ ${t}: [${e.code}] ${e.message}`);
      }
    }
  });

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓ (todas las expectativas se cumplen)' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
