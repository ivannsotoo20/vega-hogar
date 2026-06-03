// scripts/test-rls-roles.mjs
// Audit RLS impersonando usuarios reales a nivel SQL (sin password). Setea el
// JWT claim que lee auth.uid() + SET LOCAL ROLE authenticated, y consulta las
// tablas como ese usuario. Detecta:
//   1. Recursión infinita en policies (42P17 / stack depth) — lección hotfix F2.
//   2. Filtrado por rol: un 'comercial' debe ver MENOS leads que un 'admin'.
//
// No necesita credenciales: usa el auth_user_id (UUID) de usuarios ya sembrados.
// Uso: node scripts/test-rls-roles.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const PROBE = [
  'leads', 'conversations', 'conversation_messages', 'conversation_labels',
  'conversation_notes', 'message_schedules', 'pipeline_runs', 'pipeline_events',
  'tenant_configs', 'llm_configs', 'tenant_tokens', 'tenant_labels',
  'calendar_accounts', 'calendar_appointments', 'voice_calls', 'voice_transcripts',
  'agent_knowledge', 'resources', 'phases',
];

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function probeAs(authUserId, label) {
  console.log(`\n--- impersonando ${label} (sub=${String(authUserId).slice(0, 8)}…) ---`);
  const result = { leads: null, recursion: false, errors: 0 };
  for (const table of PROBE) {
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: authUserId, role: 'authenticated' }),
      ]);
      await client.query('SET LOCAL ROLE authenticated');
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
      await client.query('ROLLBACK');
      if (table === 'leads') result.leads = rows[0].n;
      console.log(`  ✓ ${table}: ${rows[0].n} filas visibles`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const recursion = err.code === '42P17' || /recursion|stack depth/i.test(err.message);
      if (recursion) result.recursion = true;
      result.errors++;
      console.log(`  ${recursion ? '✗✗ RECURSIÓN' : '✗'} ${table}: [${err.code}] ${err.message}`);
    }
  }
  return result;
}

try {
  await client.connect();

  // Un usuario por rol (admin + comercial) para comparar visibilidad.
  const { rows: users } = await client.query(
    `SELECT DISTINCT ON (role) auth_user_id, role, full_name
     FROM public.users
     WHERE role IN ('admin', 'comercial') AND active = true
     ORDER BY role, id`,
  );
  if (users.length === 0) {
    console.error('FATAL: no hay usuarios admin/comercial sembrados');
    process.exit(1);
  }

  const byRole = {};
  for (const u of users) {
    byRole[u.role] = await probeAs(u.auth_user_id, `${u.role} · ${u.full_name}`);
  }

  console.log('\n=== Resultado ===');
  const anyRecursion = Object.values(byRole).some((r) => r.recursion);
  const anyError = Object.values(byRole).some((r) => r.errors > 0);
  console.log(`  Recursión RLS: ${anyRecursion ? 'SÍ ✗✗' : 'NO ✓'}`);
  if (byRole.admin && byRole.comercial) {
    const a = byRole.admin.leads;
    const c = byRole.comercial.leads;
    const ok = c !== null && a !== null && c < a;
    console.log(`  Leads visibles → admin=${a} · comercial=${c} → filtrado por rol: ${ok ? 'OK ✓ (comercial < admin)' : 'REVISAR (comercial debería ver menos)'}`);
  }
  process.exit(anyRecursion || anyError ? 1 : 0);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
