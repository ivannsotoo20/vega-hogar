// Lee la definición actual de current_tenant() y current_user_role() para confirmar
// si están con SECURITY DEFINER o no.

import pg from 'pg';
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(`
  SELECT
    p.proname AS name,
    pg_get_functiondef(p.oid) AS definition,
    p.prosecdef AS is_security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('current_tenant', 'current_user_role')
  ORDER BY p.proname;
`);

for (const r of rows) {
  console.log(`=== ${r.name} (SECURITY DEFINER = ${r.is_security_definer}) ===`);
  console.log(r.definition);
  console.log('');
}

await client.end();
