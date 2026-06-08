// scripts/test-rls-conversations-writes.mjs
// Verifica la capa de datos de F6/S3 (apps/panel/src/lib/actions/conversations.ts)
// SIN password, todo en BEGIN…ROLLBACK. Impersona usuarios reales a nivel SQL.
//
// Comprueba:
//   1. Columnas que leen/escriben las acciones existen (cliente untyped).
//   2. WRITES de un miembro (comercial) sobre SU conversación visible → ALLOW:
//        pausa IA, handoff, leído, INSERT nota, INSERT etiqueta.
//   3. Frontera de visibilidad: INSERT nota / etiqueta sobre conversación NO
//      visible → DENY (42501) por WITH CHECK (conversation_id IN visibles).
//
// Nota: la RLS de `conversations` es FOR ALL a cualquier rol que vea el lead — el
// gate de rol de algunas acciones (p.ej. bloquear = director_oficina+) es de capa
// de aplicación, no de RLS. Aquí se valida la RLS; el gate de rol se cubre en el código.
//
// Uso: node scripts/test-rls-conversations-writes.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const READ_PROBES = [
  ['conversations', 'id, lead_id, channel, status, current_phase, ai_paused_until, is_handoff_to_human, handoff_cause, handoff_reason, handoff_at, is_unread, is_blocked, last_message_at, created_at'],
  ['conversation_messages', 'id, conversation_id, role, content, content_type, created_at'],
  ['conversation_notes', 'id, conversation_id, content, author_user_id, author_email, created_at'],
  ['conversation_labels', 'conversation_id, label_id, tenant_id, applied_by, applied_via'],
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

try {
  await client.connect();

  // Targets (raw = ve todo).
  const { rows: pick } = await client.query(
    `SELECT l.assigned_to_user_id AS uid, c.id AS conv_id, c.tenant_id
       FROM public.conversations c JOIN public.leads l ON l.id = c.lead_id
      WHERE l.assigned_to_user_id IS NOT NULL LIMIT 1`,
  );
  if (!pick[0]) throw new Error('No hay conversación con lead asignado en el seed.');
  const comercialId = pick[0].uid;
  const ownConv = pick[0].conv_id;
  const tenantId = pick[0].tenant_id;

  const { rows: cu } = await client.query(
    'SELECT auth_user_id, role, full_name FROM public.users WHERE id = $1',
    [comercialId],
  );
  const comAuth = cu[0].auth_user_id;

  const { rows: fc } = await client.query(
    `SELECT c.id FROM public.conversations c JOIN public.leads l ON l.id = c.lead_id
      WHERE l.assigned_to_user_id IS DISTINCT FROM $1 LIMIT 1`,
    [comercialId],
  );
  const foreignConv = fc[0]?.id ?? null;
  const { rows: lbl } = await client.query('SELECT id FROM public.tenant_labels LIMIT 1');
  const labelId = lbl[0]?.id ?? null;

  log(`[targets] comercial=${cu[0].full_name} (role=${cu[0].role}) ownConv=${ownConv} foreignConv=${foreignConv} label=${labelId}`);

  // READS
  log('\n=== READS (columnas + visibilidad) · comercial ===');
  for (const [table, cols] of READ_PROBES) {
    try {
      const n = await txAs(comAuth, async () => {
        await client.query(`SELECT ${cols} FROM public.${table} LIMIT 1`);
        const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
        return rows[0].n;
      });
      log(`      ✓ ${table}: columnas OK · ${n} filas visibles`);
    } catch (e) {
      failures++;
      log(`      ✗✗ ${table}: [${e.code}] ${e.message.split('\n')[0]}`);
    }
  }

  // WRITES sobre conversación propia (visible)
  log(`\n=== WRITES · comercial sobre SU conversación (${ownConv}) ===`);
  await expectWrite(comAuth, "togglePause (ai_paused_until='infinity')", 'allow',
    `UPDATE public.conversations SET ai_paused_until='infinity' WHERE id=$1`, [ownConv]);
  await expectWrite(comAuth, 'setHandoff (is_handoff_to_human + handoff_at + status)', 'allow',
    `UPDATE public.conversations SET is_handoff_to_human=true, handoff_at=now(), handoff_reason='probe', status='handoff' WHERE id=$1`, [ownConv]);
  await expectWrite(comAuth, 'setUnread (is_unread)', 'allow',
    `UPDATE public.conversations SET is_unread=true WHERE id=$1`, [ownConv]);
  await expectWrite(comAuth, 'addNote (INSERT conversation_notes)', 'allow',
    `INSERT INTO public.conversation_notes (conversation_id, tenant_id, content, author_user_id, author_email) VALUES ($1,$2,'probe (rollback)',$3,'probe@vega.test')`,
    [ownConv, tenantId, comercialId]);
  if (labelId) {
    await expectWrite(comAuth, 'applyLabel (INSERT conversation_labels)', 'allow',
      `INSERT INTO public.conversation_labels (conversation_id, label_id, tenant_id, applied_by, applied_via) VALUES ($1,$2,$3,$4,'manual')`,
      [ownConv, labelId, tenantId, comercialId]);
  }

  // Frontera de visibilidad: INSERT sobre conversación NO visible
  if (foreignConv && labelId) {
    log(`\n=== Frontera · comercial sobre conversación NO visible (${foreignConv}) ===`);
    await expectWrite(comAuth, 'addNote en conv ajena', 'deny',
      `INSERT INTO public.conversation_notes (conversation_id, tenant_id, content, author_user_id, author_email) VALUES ($1,$2,'probe',$3,'probe@vega.test')`,
      [foreignConv, tenantId, comercialId]);
    await expectWrite(comAuth, 'applyLabel en conv ajena', 'deny',
      `INSERT INTO public.conversation_labels (conversation_id, label_id, tenant_id, applied_by, applied_via) VALUES ($1,$2,$3,$4,'manual')`,
      [foreignConv, labelId, tenantId, comercialId]);
  }

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
