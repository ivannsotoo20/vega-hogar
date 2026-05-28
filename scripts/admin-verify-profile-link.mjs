// Verifica que public.users.auth_user_id == auth.users.id para Iván admin.
// Y prueba la policy users_select con anon key impersonando al user.

import { createClient } from '@supabase/supabase-js';

const TARGET_EMAIL = 'sotobautistaivan@gmail.com';
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Auth user id real
const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 200 });
const authUser = users.find((u) => (u.email ?? '').toLowerCase() === TARGET_EMAIL.toLowerCase());
console.log(`[auth.users] id=${authUser.id}  email=${authUser.email}`);

// 2. Public.users via service role (sin RLS)
const { data: pubRow } = await admin
  .from('users')
  .select('id, auth_user_id, email, role, active, tenant_id')
  .eq('email', TARGET_EMAIL.toLowerCase())
  .maybeSingle();
console.log(`[public.users via service_role]`);
console.log(`  id=${pubRow?.id}`);
console.log(`  auth_user_id=${pubRow?.auth_user_id}`);
console.log(`  email=${pubRow?.email}`);
console.log(`  role=${pubRow?.role}  active=${pubRow?.active}  tenant=${pubRow?.tenant_id}`);
console.log(`  MATCH auth.id == public.auth_user_id ? ${authUser.id === pubRow?.auth_user_id ? 'YES ✓' : 'NO ✗'}`);

// 3. Simular login con password + intentar leer public.users con ese token
const anonClient = createClient(url, anonKey);
const { data: signin, error: signinErr } = await anonClient.auth.signInWithPassword({
  email: TARGET_EMAIL,
  password: 'Fyzon.2k26!',
});
if (signinErr) {
  console.log(`\n[signInWithPassword via anon] ✗ ${signinErr.message}`);
  process.exit(1);
}
console.log(`\n[signInWithPassword via anon] ✓ session.user.id=${signin.user?.id}`);

// 4. Con ese session, leer public.users (RLS activo)
const { data: selfRow, error: selfErr } = await anonClient
  .from('users')
  .select('id, auth_user_id, email, role, active')
  .eq('auth_user_id', signin.user.id)
  .maybeSingle();

if (selfErr) {
  console.log(`[public.users via anon + session] ✗ ${selfErr.message}`);
} else if (!selfRow) {
  console.log(`[public.users via anon + session] ✗ NO row encontrada (RLS lo bloquea)`);
  console.log(`  Probable causa: policy users_select no permite la query`);
  console.log(`  Esperado: auth.uid() = ${signin.user.id}  →  match auth_user_id = ${pubRow?.auth_user_id}`);
} else {
  console.log(`[public.users via anon + session] ✓ encontrado`);
  console.log(`  id=${selfRow.id} role=${selfRow.role} active=${selfRow.active}`);
}
