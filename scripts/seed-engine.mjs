// scripts/seed-engine.mjs
// Seed operativo del motor (Fase 4): catálogo de fases dual, tenant_configs,
// tenant_followup_config, llm_configs, system labels inmobiliarios y placeholders
// de prompt_blocks. Idempotente. Cifras conservadoras (DEC-007).
//
// Los prompt_blocks reales se generan en Fase 10 vía markdown source +
// prompts:build-seed (regla 9 CLAUDE.md) — aquí solo placeholders.
//
// Uso: node scripts/seed-engine.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const TENANT_ID = 1;

// number, intent_track, name, description, max_messages
const PHASES = [
  [0, 'shared', 'Pre-contacto', 'Lead entra (WhatsApp/Meta Ads/voz), sin conversación activa', 2],
  [1, 'shared', 'Conexión', 'Apertura + detección de intención (compra/alquiler vs venta/arrendamiento)', 5],
  [2, 'buyer', 'Necesidad', 'Zona, presupuesto, habitaciones, m², motivación, urgencia', 6],
  [2, 'seller', 'Inmueble', 'Ubicación, tipo, m², estado, motivo de venta, expectativa de precio', 6],
  [3, 'buyer', 'Cualificación', 'Financiación/hipoteca, plazos, capacidad', 4],
  [3, 'seller', 'Cualificación', 'Titularidad, urgencia, exclusividad, situación legal', 4],
  [4, 'buyer', 'Puente', 'Resumen de la necesidad y confirmación', 1],
  [4, 'seller', 'Puente', 'Resumen del inmueble y confirmación', 1],
  [5, 'buyer', 'Propuesta de visita', 'Propone inmuebles compatibles y plantea la visita', 2],
  [5, 'seller', 'Propuesta de tasación', 'Plantea visita técnica de valoración (humana)', 2],
  [6, 'buyer', 'Agenda de visita', 'Agenda la visita al inmueble con el comercial', 2],
  [6, 'seller', 'Agenda de tasación', 'Agenda la visita técnica con el asistente/captador', 2],
  [7, 'shared', 'Cierre / Handoff', 'Cierre de la conversación y entrega al humano', 2],
];

// name, color, destination_bucket, pause_ai_on_apply
const LABELS = [
  ['Lead caliente', '#dc2626', 'hot', false],
  ['Activo', '#3b82f6', 'chats', false],
  ['Visita agendada', '#059669', 'done', false],
  ['Tasación pendiente', '#d97706', 'hot', false],
  ['Comprado', '#16a34a', 'bought', true],
  ['Alquilado', '#16a34a', 'bought', true],
  ['Cita cancelada', '#d97706', 'cancelled', false],
  ['No-Show', '#dc2626', 'no_show', false],
  ['Recontactar', '#0ea5e9', 'recontact', false],
  ['Cierre perdido', '#6b7280', 'lost', true],
];

// automation_keywords: pattern (substring case-insensitive), type ∈ bienvenida|lm|inbound|wa_open.
// Clasifican el inbound para fijar conversations.conversation_source (F10b).
const KEYWORDS = [
  ['comprar', 'inbound'],
  ['compra', 'inbound'],
  ['alquilar', 'inbound'],
  ['alquiler', 'inbound'],
  ['vender', 'inbound'],
  ['tasar', 'inbound'],
  ['tasación', 'inbound'],
  ['piso', 'inbound'],
  ['info', 'inbound'],
];

// Token del webhook MOCK de WhatsApp (LOCAL ONLY — golden path / simulador del panel;
// el motor no se despliega a prod en F10). El harness lo lee para postear el inbound.
const MOCK_WA_TOKEN = 'mock-wa-vega-dev-token';

// role, provider, model (api_key_encrypted NULL → la key real viene por env del motor)
const LLM_CONFIGS = [
  ['generator', 'anthropic', 'claude-haiku-4-5'],
  ['judge', 'anthropic', 'claude-haiku-4-5'],
  ['splitter', 'anthropic', 'claude-haiku-4-5'],
];

// tenant_id (NULL = shared), block_key, content, sort_order
const PROMPT_BLOCKS = [
  [null, 'core_v1_base', '-- PENDIENTE Fase 10 (markdown source + prompts:build-seed) --', 0],
  [TENANT_ID, 'agencia_vega', '-- PENDIENTE Fase 10 (voz Vega Hogar, anti-jugadas) --', 5],
  [null, 'output_contract_v1', '-- PENDIENTE Fase 10 (schema respond_as_inmobiliario) --', 100],
];

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const { rows: t } = await client.query('SELECT id FROM public.tenants WHERE id = $1', [TENANT_ID]);
  if (t.length === 0) {
    console.error(`FATAL: tenant id=${TENANT_ID} not found`);
    process.exit(1);
  }

  // phases
  let phasesN = 0;
  for (const [number, track, name, desc, maxMsg] of PHASES) {
    await client.query(
      `INSERT INTO public.phases (number, intent_track, name, description, max_messages)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (number, intent_track)
       DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, max_messages = EXCLUDED.max_messages`,
      [number, track, name, desc, maxMsg],
    );
    phasesN++;
  }

  // tenant_configs (deja defaults; no pisa si ya existe)
  await client.query(
    `INSERT INTO public.tenant_configs (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [TENANT_ID],
  );

  // tenant_followup_config
  await client.query(
    `INSERT INTO public.tenant_followup_config (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [TENANT_ID],
  );

  // llm_configs
  let llmN = 0;
  for (const [role, provider, model] of LLM_CONFIGS) {
    await client.query(
      `INSERT INTO public.llm_configs (tenant_id, role, provider, model)
       VALUES ($1, $2::public.llm_role, $3::public.llm_provider, $4)
       ON CONFLICT (tenant_id, role, provider, model) DO NOTHING`,
      [TENANT_ID, role, provider, model],
    );
    llmN++;
  }

  // tenant_labels (system)
  let labelsN = 0;
  for (const [name, color, bucket, pause] of LABELS) {
    await client.query(
      `INSERT INTO public.tenant_labels (tenant_id, name, color, destination_bucket, is_system, pause_ai_on_apply)
       VALUES ($1, $2, $3, $4, true, $5)
       ON CONFLICT (tenant_id, name)
       DO UPDATE SET color = EXCLUDED.color, destination_bucket = EXCLUDED.destination_bucket`,
      [TENANT_ID, name, color, bucket, pause],
    );
    labelsN++;
  }

  // automation_keywords (tabla existe; NO migración). Guard WHERE NOT EXISTS por (tenant, pattern).
  let kwN = 0;
  for (const [pattern, type] of KEYWORDS) {
    const { rowCount } = await client.query(
      `INSERT INTO public.automation_keywords (tenant_id, pattern, type, is_active)
       SELECT $1::bigint, $2::text, $3::text, true
       WHERE NOT EXISTS (
         SELECT 1 FROM public.automation_keywords WHERE tenant_id = $1::bigint AND pattern = $2::text
       )`,
      [TENANT_ID, pattern, type],
    );
    kwN += rowCount;
  }

  // tenant_tokens — token del webhook MOCK (guard por tenant + purpose).
  const { rowCount: tokN } = await client.query(
    `INSERT INTO public.tenant_tokens (tenant_id, token, purpose, is_active)
     SELECT $1::bigint, $2::text, 'whatsapp_mock', true
     WHERE NOT EXISTS (
       SELECT 1 FROM public.tenant_tokens WHERE tenant_id = $1::bigint AND purpose = 'whatsapp_mock'
     )`,
    [TENANT_ID, MOCK_WA_TOKEN],
  );

  // prompt_blocks placeholders (sin unique → guard por block_key + tenant)
  let blocksN = 0;
  for (const [tid, key, content, sort] of PROMPT_BLOCKS) {
    const { rowCount } = await client.query(
      `INSERT INTO public.prompt_blocks (tenant_id, block_key, content, sort_order, is_active, version)
       SELECT $1::bigint, $2::text, $3::text, $4::int, true, 1
       WHERE NOT EXISTS (
         SELECT 1 FROM public.prompt_blocks
         WHERE block_key = $2::text AND tenant_id IS NOT DISTINCT FROM $1::bigint
       )`,
      [tid, key, content, sort],
    );
    blocksN += rowCount;
  }

  console.log(`[seed-engine] OK · phases=${phasesN} llm_configs=${llmN} labels=${labelsN} keywords(+${kwN}) mock_token(+${tokN}) prompt_blocks(+${blocksN}) tenant_configs+followup=ensured`);
} catch (err) {
  console.error('FATAL:', err.message);
  if (err.hint) console.error('  hint:', err.hint);
  process.exit(1);
} finally {
  await client.end();
}
