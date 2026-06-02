// scripts/test-rls-with-session.mjs
// Audit RLS CON sesión autenticada (password grant vía REST). Detecta:
//   1. Recursión infinita en helpers/policies (stack depth / 42P17) — lección F2.
//   2. Que un usuario autenticado consulta su tenant sin error.
//
// Requiere en .env.local: TEST_LOGIN_EMAIL, TEST_LOGIN_PASSWORD
//   (+ SUPABASE_URL, SUPABASE_ANON_KEY). Si faltan las credenciales → SKIP (exit 0).
// Usa fetch (sin @supabase/supabase-js, que no resuelve desde la raíz del monorepo).
//
// Uso: node scripts/test-rls-with-session.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_LOGIN_EMAIL;
const PASSWORD = process.env.TEST_LOGIN_PASSWORD;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('FATAL: SUPABASE_URL / SUPABASE_ANON_KEY missing in .env.local');
  process.exit(1);
}
if (!EMAIL || !PASSWORD) {
  console.log('[with-session] SKIP — define TEST_LOGIN_EMAIL y TEST_LOGIN_PASSWORD en .env.local');
  console.log('[with-session] (verifica que un login real no entra en recursión RLS ni pierde acceso)');
  process.exit(0);
}

const PROBE = [
  'leads', 'conversations', 'conversation_messages', 'conversation_labels',
  'conversation_notes', 'message_schedules', 'pipeline_runs', 'tenant_configs',
  'llm_configs', 'tenant_labels', 'calendar_appointments', 'voice_calls',
  'voice_transcripts', 'phases',
];

// 1) Password grant → access_token
const tokenResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const tokenBody = await tokenResp.json();
if (!tokenResp.ok || !tokenBody.access_token) {
  console.error(`FATAL: login falló → HTTP ${tokenResp.status} ${JSON.stringify(tokenBody).slice(0, 150)}`);
  process.exit(1);
}
console.log(`[with-session] login OK como ${EMAIL}\n`);
const accessToken = tokenBody.access_token;

let passes = 0;
let fails = 0;

for (const table of PROBE) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const body = await resp.json().catch(() => null);
  if (resp.status === 200 && Array.isArray(body)) {
    console.log(`  ✓ ${table}: query OK (${body.length} filas, sin recursión)`);
    passes++;
  } else {
    const msg = JSON.stringify(body).slice(0, 160);
    const recursion = /recursion|stack depth/i.test(msg) || body?.code === '42P17';
    console.log(`  ${recursion ? '✗✗ RECURSIÓN' : '✗'} ${table}: HTTP ${resp.status} ${msg}`);
    fails++;
  }
}

console.log('');
console.log('=== Resultado audit RLS (con sesión) ===');
console.log(`  Tablas sondeadas: ${PROBE.length}`);
console.log(`  OK: ${passes} · Fallos: ${fails}`);
process.exit(fails > 0 ? 1 : 0);
