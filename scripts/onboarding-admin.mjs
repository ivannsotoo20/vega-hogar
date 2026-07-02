// scripts/onboarding-admin.mjs
// ONBOARDING comunidad: crea (o repara) TU usuario admin del panel en una
// instalación propia. Idempotente: si el auth user ya existe solo fija la
// password; si la fila public.users ya existe la promociona a admin.
//
// service-role vía GoTrue admin REST (patrón qa-set-password.mjs) + pg para
// public.users (patrón seed-engine.mjs). SOLO desde script — regla 2: el
// service-role jamás entra al panel.
//
// Uso: node scripts/onboarding-admin.mjs --email tu@email.com --password 'TuPass123!' [--name "Tu Nombre"]
//
// Después: entra en http://localhost:3000/login con EMAIL + PASSWORD
// (NO uses magic link la primera vez: el SMTP integrado de Supabase solo
// envía a miembros del proyecto y con rate limit).

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.DATABASE_URL;

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? (process.argv[i + 1] ?? '') : '';
}
const email = arg('--email').trim().toLowerCase();
const password = arg('--password');
const fullName = arg('--name').trim() || email.split('@')[0];

if (!URL || !KEY || !DB) {
  console.error('FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL faltan en .env.local');
  process.exit(1);
}
if (!email || !password) {
  console.error("Uso: node scripts/onboarding-admin.mjs --email tu@email.com --password 'TuPass123!' [--name \"Tu Nombre\"]");
  process.exit(1);
}
if (password.length < 8) {
  console.error('FATAL: la password debe tener al menos 8 caracteres.');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// 1) Auth user: localizar por email → actualizar password, o crear si no existe.
const listResp = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers });
const listBody = await listResp.json().catch(() => null);
if (!listResp.ok) {
  console.error('FATAL list users:', JSON.stringify(listBody).slice(0, 200));
  process.exit(1);
}
const users = listBody?.users ?? listBody ?? [];
let authUser = users.find((u) => (u.email || '').toLowerCase() === email);

if (authUser) {
  const upResp = await fetch(`${URL}/auth/v1/admin/users/${authUser.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!upResp.ok) {
    console.error('FATAL update password:', JSON.stringify(await upResp.json().catch(() => null)).slice(0, 200));
    process.exit(1);
  }
  console.log(`✓ auth user existente → password actualizada (${email})`);
} else {
  const crResp = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  const crBody = await crResp.json().catch(() => null);
  if (!crResp.ok) {
    console.error('FATAL create user:', JSON.stringify(crBody).slice(0, 200));
    process.exit(1);
  }
  authUser = crBody?.user ?? crBody;
  console.log(`✓ auth user creado (${email} → ${authUser.id})`);
}

// 2) public.users: crear como admin del tenant 1, o promocionar si ya existe.
const db = new pg.Client({ connectionString: DB });
await db.connect();
try {
  // Lookup por auth_user_id O por email (tenant 1): si el auth user fue borrado
  // y recreado en el dashboard, la fila public.users vieja sigue existiendo con
  // el mismo email — hay que re-vincularla, no INSERTar (unique tenant+email).
  const { rows: existing } = await db.query(
    'SELECT id FROM public.users WHERE auth_user_id = $1 OR (tenant_id = 1 AND email = $2) LIMIT 1',
    [authUser.id, email],
  );
  if (existing.length === 0) {
    const { rows } = await db.query(
      `INSERT INTO public.users (auth_user_id, tenant_id, email, full_name, role, active, is_agency_admin)
       VALUES ($1, 1, $2, $3, 'admin', true, true)
       RETURNING id, role, is_agency_admin`,
      [authUser.id, email, fullName],
    );
    console.log(`✓ public.users creado → id=${rows[0].id} role=admin is_agency_admin=true`);
  } else {
    const { rows } = await db.query(
      `UPDATE public.users
          SET auth_user_id = $2, role = 'admin', is_agency_admin = true, active = true
        WHERE id = $1
        RETURNING id, role, is_agency_admin`,
      [existing[0].id, authUser.id],
    );
    console.log(`✓ public.users re-vinculado/promocionado → id=${rows[0].id} role=admin is_agency_admin=true`);
  }
} finally {
  await db.end();
}

console.log('');
console.log('=== TU ADMIN ESTÁ LISTO ===');
console.log(`  1. Arranca el panel:  pnpm --filter @vega-hogar/panel dev`);
console.log(`  2. Entra en:          http://localhost:3000/login`);
console.log(`  3. Usa EMAIL + PASSWORD (pestaña password — NO magic link la primera vez).`);
