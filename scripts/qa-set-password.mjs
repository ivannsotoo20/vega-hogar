// scripts/qa-set-password.mjs
// QA-ONLY: fija (o resetea) la password de un usuario seed para verificación
// visual con login real en el panel. service-role vía GoTrue admin REST API
// (solo desde script, NUNCA desde el panel — regla 2). Confirma el email también
// (por si el seed user nunca hizo login y no tiene email_confirmed_at).
//
// Uso: node scripts/qa-set-password.mjs <email> [password]
//      (password por defecto: la convención QA del proyecto)

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.argv[2] || '').trim().toLowerCase();
const password = process.argv[3] || 'Fyzon.2k26!';

if (!URL || !KEY) {
  console.error('FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local');
  process.exit(1);
}
if (!email) {
  console.error('Uso: node scripts/qa-set-password.mjs <email> [password]');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

// 1) localizar el auth user por email
const listResp = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers });
const listBody = await listResp.json().catch(() => null);
if (!listResp.ok) {
  console.error('FATAL list users:', JSON.stringify(listBody).slice(0, 200));
  process.exit(1);
}
const users = listBody?.users ?? listBody ?? [];
const user = users.find((u) => (u.email || '').toLowerCase() === email);
if (!user) {
  console.error(`✗ no hay auth user con email=${email}`);
  process.exit(1);
}
console.log(`✓ ${email} → id=${user.id} · email_confirmed=${user.email_confirmed_at ?? 'NO'}`);

// 2) set password + confirmar email
const upResp = await fetch(`${URL}/auth/v1/admin/users/${user.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ password, email_confirm: true }),
});
const upBody = await upResp.json().catch(() => null);
if (!upResp.ok) {
  console.error('FATAL update:', JSON.stringify(upBody).slice(0, 200));
  process.exit(1);
}
console.log(`✓ password QA fijada para ${email} (len=${password.length})`);
