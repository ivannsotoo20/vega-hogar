// scripts/golden-path-smoke.mjs
// Harness LOCAL del golden path F10b (mock). Dispara el flujo end-to-end:
//   POST /webhooks/whatsapp-mock → lead-ingest → debounce → cron → pipeline 3-LLM
//   → mock_whatsapp_outbox + conversation_messages(role='agent').
//
// PRERREQUISITOS (entorno de Iván — NO los pone Claude):
//   1. Motor + redis corriendo en local con cron ON:
//        MOTOR_CRON_ENABLED=true docker compose up --build   (o pnpm --filter @vega-hogar/motor dev)
//   2. .env.local con ANTHROPIC_API_KEY rellena (hoy está vacía) + SUPABASE_* + REDIS_URL.
//   3. Seed aplicado (node scripts/seed-engine.mjs) → keywords + token mock.
//
// USO:
//   node scripts/golden-path-smoke.mjs            # dispara + espera + reporta
//   node scripts/golden-path-smoke.mjs --cleanup  # borra los datos de prueba (seed pristino)
//
// Read-only sobre la BD salvo (a) el POST al webhook (el motor escribe) y
// (b) --cleanup (borra SOLO el lead de prueba y su cascada).

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const MOTOR_URL = process.env.MOTOR_INTERNAL_URL || 'http://localhost:3010';
const MOCK_TOKEN = process.env.MOCK_WA_TOKEN || 'mock-wa-vega-dev-token';
const TEST_PHONE = process.env.SMOKE_TEST_PHONE || '+34699000001';
const TENANT_ID = 1;
const TIMEOUT_MS = 45_000;
const POLL_MS = 2000;

const { Client } = pg;
const db = new Client({ connectionString: process.env.DATABASE_URL });

async function cleanup() {
  await db.connect();
  const { rows: leads } = await db.query('SELECT id FROM public.leads WHERE tenant_id=$1 AND phone=$2', [TENANT_ID, TEST_PHONE]);
  if (leads.length === 0) {
    console.log('[smoke] cleanup: no hay lead de prueba, nada que borrar.');
    await db.end();
    return;
  }
  const leadIds = leads.map((l) => l.id);
  const { rows: convs } = await db.query('SELECT id FROM public.conversations WHERE lead_id = ANY($1)', [leadIds]);
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
    // Borrar dependencias que no cascadean desde leads (observabilidad por conversación).
    await db.query('DELETE FROM public.pipeline_events WHERE conversation_id = ANY($1)', [convIds]);
    await db.query('DELETE FROM public.pipeline_runs WHERE conversation_id = ANY($1)', [convIds]);
    await db.query('DELETE FROM public.llm_calls WHERE conversation_id = ANY($1)', [convIds]);
  }
  // leads → cascada: conversations, conversation_messages, mock_whatsapp_outbox, visits.
  await db.query('DELETE FROM public.leads WHERE id = ANY($1)', [leadIds]);
  console.log(`[smoke] cleanup OK · leads=${leadIds.length} convs=${convIds.length} borrados (seed pristino).`);
  await db.end();
}

async function smoke() {
  // 1. POST inbound al webhook mock.
  const url = `${MOTOR_URL}/webhooks/whatsapp-mock/${MOCK_TOKEN}`;
  const payload = { phone: TEST_PHONE, text: 'Hola, quiero comprar un piso en Ruzafa, presupuesto 280.000', name: 'Lead Prueba Smoke' };
  console.log(`[smoke] POST ${url}`);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  console.log(`[smoke] webhook → HTTP ${res.status}`, body);
  if (!res.ok) {
    console.error('[smoke] FALLO: el webhook no aceptó el inbound. ¿Motor arriba? ¿Seed aplicado (token)?');
    process.exit(1);
  }
  const conversationId = body.conversationId;

  // 2. Poll: esperar a que el cron procese (mensaje del agente + outbox).
  await db.connect();
  const deadline = Date.now() + TIMEOUT_MS;
  let agentMsgs = [];
  let outbox = [];
  while (Date.now() < deadline) {
    ({ rows: agentMsgs } = await db.query(
      "SELECT id, role, content FROM public.conversation_messages WHERE conversation_id=$1 AND role='agent' ORDER BY id",
      [conversationId],
    ));
    ({ rows: outbox } = await db.query('SELECT id, parts, status FROM public.mock_whatsapp_outbox WHERE conversation_id=$1 ORDER BY id', [conversationId]));
    if (agentMsgs.length > 0 && outbox.length > 0) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  // 3. Reportar estado final.
  const { rows: convRows } = await db.query('SELECT status, current_phase FROM public.conversations WHERE id=$1', [conversationId]);
  const { rows: runs } = await db.query('SELECT outcome, total_cost_usd, splitter_parts FROM public.pipeline_runs WHERE conversation_id=$1 ORDER BY id DESC LIMIT 1', [conversationId]);
  const { rows: visits } = await db.query('SELECT id, is_tasation, scheduled_for FROM public.visits WHERE lead_id IN (SELECT lead_id FROM public.conversations WHERE id=$1)', [conversationId]);
  await db.end();

  console.log('\n=== GOLDEN PATH — resultado ===');
  console.log(`conversación #${conversationId} · status=${convRows[0]?.status} · fase=${convRows[0]?.current_phase}`);
  console.log(`pipeline_run: ${runs[0] ? `${runs[0].outcome} · $${runs[0].total_cost_usd} · ${runs[0].splitter_parts} partes` : '(ninguno)'}`);
  console.log(`mensajes agente: ${agentMsgs.length}`);
  for (const m of agentMsgs) console.log(`   · ${m.content}`);
  console.log(`outbox (mock): ${outbox.length} fila(s)`);
  for (const o of outbox) console.log(`   · [${o.status}] ${JSON.stringify(o.parts)}`);
  console.log(`visitas agendadas: ${visits.length}`);

  const ok = agentMsgs.length > 0 && outbox.length > 0 && runs[0]?.outcome === 'success';
  console.log(`\n[smoke] ${ok ? 'OK ✅ golden path completo' : 'INCOMPLETO ⚠ (revisa que el cron esté ON y ANTHROPIC_API_KEY rellena)'}`);
  console.log('[smoke] limpia con: node scripts/golden-path-smoke.mjs --cleanup');
  process.exit(ok ? 0 : 1);
}

try {
  if (process.argv.includes('--cleanup')) await cleanup();
  else await smoke();
} catch (err) {
  console.error('[smoke] FATAL:', err.message);
  process.exit(1);
}
