// scripts/admin-diagnose-and-set-password.mjs
// AD-HOC: Diagnostica por qué magic link no llega + setea password al admin.
//
// Conecta con service role (solo desde script, no desde panel).
// Lista users en auth.users buscando el email, verifica email_confirmed_at,
// setea password, reporta.
//
// Uso: node scripts/admin-diagnose-and-set-password.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const TARGET_EMAIL = 'sotobautistaivan@gmail.com';
const NEW_PASSWORD = 'Fyzon.2k26!';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[1/4] Listando users en auth.users buscando ${TARGET_EMAIL}...`);
const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
if (listErr) {
  console.error('FATAL listUsers:', listErr.message);
  process.exit(1);
}

const matches = listData.users.filter(
  (u) => (u.email ?? '').toLowerCase() === TARGET_EMAIL.toLowerCase(),
);

if (matches.length === 0) {
  console.error(`[1/4] ✗ NO se encontró ningún user con email = ${TARGET_EMAIL}`);
  console.log('   Emails en auth.users:');
  listData.users.forEach((u) => console.log(`     - ${u.email ?? '<sin email>'}  (id=${u.id})`));
  process.exit(1);
}

if (matches.length > 1) {
  console.warn(`[1/4] ⚠ ${matches.length} users con el mismo email. Listando todos:`);
  matches.forEach((u) => console.log(`     id=${u.id} confirmed=${u.email_confirmed_at} last_sign_in=${u.last_sign_in_at}`));
}

const user = matches[0];
console.log(`[1/4] ✓ user encontrado: id=${user.id}`);
console.log(`        email_confirmed_at: ${user.email_confirmed_at ?? '<NO confirmado>'}`);
console.log(`        last_sign_in_at:    ${user.last_sign_in_at ?? '<nunca>'}`);
console.log(`        created_at:         ${user.created_at}`);
console.log(`        banned_until:       ${user.banned_until ?? '<no banned>'}`);
console.log(`        has_password:       ${user.encrypted_password ? 'yes (hashed)' : 'no/unknown via admin'}`);
console.log(`        identities:         ${(user.identities ?? []).map((i) => i.provider).join(', ') || '<ninguna>'}`);

console.log(`\n[2/4] Verificando si email_confirmed_at está seteado...`);
if (!user.email_confirmed_at) {
  console.log(`     ⚠ NO confirmado — magic link signInWithOtp con shouldCreateUser:false`);
  console.log(`       requiere email_confirmed_at para enviar el OTP.`);
  console.log(`     Confirmando email ahora vía admin.updateUserById...`);
  const { error: confErr } = await admin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });
  if (confErr) {
    console.error(`     ✗ FAIL: ${confErr.message}`);
  } else {
    console.log(`     ✓ email confirmado`);
  }
} else {
  console.log(`     ✓ email ya confirmado`);
}

console.log(`\n[3/4] Seteando password ${NEW_PASSWORD.replace(/./g, '*')} (longitud=${NEW_PASSWORD.length})...`);
const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, {
  password: NEW_PASSWORD,
});
if (pwErr) {
  console.error(`     ✗ FAIL: ${pwErr.message}`);
  process.exit(1);
}
console.log(`     ✓ password seteado`);

console.log(`\n[4/4] Verificando estado final...`);
const { data: finalData, error: finalErr } = await admin.auth.admin.getUserById(user.id);
if (finalErr) {
  console.error('FAIL getUserById:', finalErr.message);
  process.exit(1);
}
const f = finalData.user;
console.log(`     id:                 ${f.id}`);
console.log(`     email:              ${f.email}`);
console.log(`     email_confirmed_at: ${f.email_confirmed_at}`);
console.log(`     updated_at:         ${f.updated_at}`);

// También chequeamos public.users link
console.log(`\n[bonus] Verificando link en public.users...`);
const { data: pubRow, error: pubErr } = await admin
  .from('users')
  .select('id, email, role, active, tenant_id')
  .eq('auth_user_id', user.id)
  .maybeSingle();
if (pubErr) {
  console.error(`     ✗ pubErr: ${pubErr.message}`);
} else if (!pubRow) {
  console.error(`     ✗ NO row en public.users con auth_user_id=${user.id}`);
} else {
  console.log(`     ✓ public.users: id=${pubRow.id} email=${pubRow.email} role=${pubRow.role} active=${pubRow.active} tenant=${pubRow.tenant_id}`);
}

console.log(`\n=== DONE ===`);
