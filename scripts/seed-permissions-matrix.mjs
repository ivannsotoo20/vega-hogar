// scripts/seed-permissions-matrix.mjs
// Inserta defaults en public.permissions_matrix mapeados 1:1 a las RLS policies
// de Fase 1 (ground truth de seguridad). Idempotente vía ON CONFLICT.
//
// Granted matrix por rol:
//   admin               → todo true
//   director_general    → todo excepto delete + integrations.edit + admin.permissions_matrix.edit
//   director_oficina    → su oficina (sin tenant-wide ni delete ni admin.*)
//   comercial           → solo lectura catálogo + sus leads/visits
//   asistente_captador  → cross-tenant para captación de vendedores
//
// Uso: node scripts/seed-permissions-matrix.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const ROLES = [
  'admin',
  'director_general',
  'director_oficina',
  'comercial',
  'asistente_captador',
];

// Permission key → matriz de granted por rol (orden ROLES).
// admin              director_general   director_oficina   comercial          asistente_captador
const PERMISSIONS = [
  ['properties.view',                   [true,  true,  true,  true,  true ]],
  ['properties.create',                 [true,  true,  true,  false, false]],
  ['properties.update',                 [true,  true,  true,  false, false]],
  ['properties.delete',                 [true,  false, false, false, false]],

  ['leads.view_assigned',               [true,  true,  false, true,  true ]],
  ['leads.view_office',                 [true,  true,  true,  false, false]],
  ['leads.view_tenant',                 [true,  true,  false, false, true ]],
  ['leads.create',                      [true,  true,  true,  false, true ]],
  ['leads.assign',                      [true,  true,  true,  false, false]],
  ['leads.delete',                      [true,  false, false, false, false]],

  ['visits.view_own',                   [true,  true,  true,  true,  true ]],
  ['visits.view_office',                [true,  true,  true,  false, false]],
  ['visits.create',                     [true,  true,  true,  true,  true ]],
  ['visits.reassign',                   [true,  true,  true,  false, false]],

  ['integrations.view',                 [true,  true,  false, false, false]],
  ['integrations.edit',                 [true,  false, false, false, false]],

  ['admin.users.view',                  [true,  true,  false, false, false]],
  ['admin.users.invite',                [true,  true,  false, false, false]],
  ['admin.permissions_matrix.edit',     [true,  false, false, false, false]],

  // Port SETTER (F6+): conversaciones, pipeline, captación, agente, agencia.
  ['admin.cerebro.edit',                [true,  false, false, false, false]],
  ['admin.tenants.manage',              [true,  false, false, false, false]],
  ['conversations.view',                [true,  true,  true,  true,  true ]],
  ['conversations.reply',               [true,  true,  true,  true,  true ]],
  ['pipeline.view',                     [true,  true,  true,  true,  true ]],
  ['pipeline.move',                     [true,  true,  true,  true,  true ]],
  ['captacion.view',                    [true,  true,  true,  false, true ]],
  ['labels.manage',                     [true,  true,  false, false, false]],
  ['keywords.manage',                   [true,  true,  false, false, false]],
  ['agent.pause',                       [true,  true,  true,  true,  true ]],
  ['agent.handoff',                     [true,  true,  true,  true,  true ]],
];

const TENANT_ID = 1; // Vega Hogar (único tenant)

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const { rows: tenantCheck } = await client.query(
    'SELECT id, slug FROM public.tenants WHERE id = $1',
    [TENANT_ID],
  );
  if (tenantCheck.length === 0) {
    console.error(`FATAL: tenant id=${TENANT_ID} not found`);
    process.exit(1);
  }
  console.log(`[seed] tenant ${TENANT_ID} (${tenantCheck[0].slug}) found`);

  let inserts = 0;
  let updates = 0;

  for (const [key, grantedRow] of PERMISSIONS) {
    for (let i = 0; i < ROLES.length; i++) {
      const role = ROLES[i];
      const granted = grantedRow[i];
      const result = await client.query(
        `INSERT INTO public.permissions_matrix (tenant_id, role, permission_key, granted)
         VALUES ($1, $2::public.user_role, $3, $4)
         ON CONFLICT (tenant_id, role, permission_key)
         DO UPDATE SET granted = EXCLUDED.granted, updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [TENANT_ID, role, key, granted],
      );
      if (result.rows[0].inserted) inserts++;
      else updates++;
    }
  }

  const { rows: countRows } = await client.query(
    'SELECT COUNT(*)::int AS n FROM public.permissions_matrix WHERE tenant_id = $1',
    [TENANT_ID],
  );

  console.log(
    `[seed] OK · inserts=${inserts} updates=${updates} · total rows tenant=${TENANT_ID}: ${countRows[0].n}`,
  );
  console.log(`[seed] expected = ${PERMISSIONS.length * ROLES.length} (${PERMISSIONS.length} keys × ${ROLES.length} roles)`);
} catch (err) {
  console.error('FATAL:', err.message);
  if (err.hint) console.error('  hint:', err.hint);
  process.exit(1);
} finally {
  await client.end();
}
