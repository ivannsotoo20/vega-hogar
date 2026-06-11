// scripts/test-rls-anon-leaks.mjs
// Audit RLS: intenta leer todas las tablas con tenant_id usando SUPABASE_ANON_KEY
// (sin sesión autenticada). Debe devolver 0 rows en TODAS — si alguna devuelve
// datos, hay un LEAK.
//
// Portado de setters_ia, adaptado a Vega Hogar.
//
// Uso: node scripts/test-rls-anon-leaks.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('FATAL: SUPABASE_URL or SUPABASE_ANON_KEY missing in .env.local');
  process.exit(1);
}

// Todas las tablas con tenant_id que DEBEN bloquear acceso a anon sin sesión.
const TABLES = [
  'tenants',
  'users',
  'offices',
  'user_office_assignments',
  'properties',
  'property_photos',
  'property_owners',
  'leads',
  'lead_preferences',
  'lead_property_interest',
  'conversations',
  'conversation_messages',
  'message_schedules',
  'visits',
  'prompt_blocks',
  'integration_accounts',
  'permissions_matrix',
  // Tablas del port (Fase 4)
  'tenant_configs',
  'phases',
  'llm_configs',
  'llm_calls',
  'tenant_tokens',
  'agent_knowledge',
  'resources',
  'pipeline_runs',
  'pipeline_events',
  'prompt_block_versions',
  'prompt_block_drafts',
  'followup_templates',
  'tenant_followup_config',
  'automation_keywords',
  'tenant_labels',
  'conversation_labels',
  'label_automation_rules',
  'conversation_notes',
  'calendar_accounts',
  'calendar_appointments',
  'ignored_users',
  'voice_calls',
  'voice_transcripts',
  'mock_whatsapp_outbox',
  'pending_invites',
];

let passes = 0;
let fails = 0;
const leaks = [];

console.log(`[anon-audit] Probing ${TABLES.length} tables via PostgREST with anon key (no session)…\n`);

for (const table of TABLES) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=10`;
  let status = 0;
  let body = null;
  try {
    const resp = await fetch(url, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
    });
    status = resp.status;
    body = await resp.json();
  } catch (err) {
    console.error(`  ✗ ${table}: network error → ${err.message}`);
    fails++;
    continue;
  }

  // Esperamos 200 + array vacío (RLS bloquea, devuelve [])
  if (status !== 200) {
    console.log(`  ⚠ ${table}: HTTP ${status} (esperado 200) → ${JSON.stringify(body).slice(0, 100)}`);
    // 401/403 también es OK (acceso denegado total). 404 sería problema.
    if (status === 401 || status === 403) {
      passes++;
      continue;
    }
    fails++;
    continue;
  }

  if (!Array.isArray(body)) {
    console.log(`  ⚠ ${table}: respuesta no es array → ${JSON.stringify(body).slice(0, 100)}`);
    fails++;
    continue;
  }

  if (body.length > 0) {
    console.log(`  ✗ ${table}: LEAK (${body.length} rows visibles para anon)`);
    leaks.push({ table, count: body.length, sample: body[0] });
    fails++;
  } else {
    console.log(`  ✓ ${table}: 0 rows (RLS bloquea correctamente)`);
    passes++;
  }
}

console.log('');
console.log(`=== Resultado audit RLS ===`);
console.log(`  Tablas verificadas: ${TABLES.length}`);
console.log(`  Pases (0 rows): ${passes}`);
console.log(`  Fallos: ${fails}`);

if (leaks.length > 0) {
  console.log('');
  console.log('=== LEAKS DETECTADAS ===');
  for (const leak of leaks) {
    console.log(`  ${leak.table}: ${leak.count} rows`);
    console.log(`    sample: ${JSON.stringify(leak.sample).slice(0, 200)}`);
  }
}

process.exit(fails > 0 ? 1 : 0);
