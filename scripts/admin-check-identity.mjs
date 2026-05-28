// Quick check: ¿el user tiene ahora una identity tras setear password?

import { createClient } from '@supabase/supabase-js';

const TARGET_EMAIL = 'sotobautistaivan@gmail.com';
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 200 });
const user = users.find((u) => (u.email ?? '').toLowerCase() === TARGET_EMAIL.toLowerCase());

if (!user) {
  console.log('NOT FOUND');
  process.exit(1);
}

console.log(`id:         ${user.id}`);
console.log(`email:      ${user.email}`);
console.log(`identities (${(user.identities ?? []).length}):`);
for (const i of user.identities ?? []) {
  console.log(`  - provider=${i.provider} created=${i.created_at} last_sign_in=${i.last_sign_in_at}`);
}
if ((user.identities ?? []).length === 0) {
  console.log('  <NINGUNA — magic link no funcionará>');
}
