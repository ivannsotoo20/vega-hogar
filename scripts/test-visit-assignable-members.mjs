// scripts/test-visit-assignable-members.mjs
// Verificación de la capa UX de F8.1: el set de comerciales "asignables" que el
// panel ofrece al director_oficina en `/visits` (alta de visita + reasignación).
//
// `listAssignableMembers()` (apps/panel/src/lib/actions/members.ts) deriva ese set
// con DOS queries anon+RLS sobre `user_office_assignments`, espejo del scope de
// ESCRITURA de la RLS de `visits` tras la migración 015 (director_oficina → solo
// comerciales de su oficina). Aquí reproducimos esas mismas dos queries
// impersonando a cada do (set_config('request.jwt.claims') + SET LOCAL ROLE
// authenticated) dentro de BEGIN…ROLLBACK (cero cambios persistentes) y
// comprobamos, por cada do:
//   1. el set es no vacío e incluye al propio do (default «yo» del diálogo);
//   2. incluye a TODOS los comerciales de su(s) oficina(s);
//   3. EXCLUYE a los comerciales de otra oficina (el papercut que arreglamos);
//   4. un comercial foráneo SÍ es visible para el do en `users` (users_select es
//      tenant-wide) pero NO asignable → demuestra que el filtro hace trabajo real.
//
// NO toca la RLS: la denegación a nivel BD (do asignando cross-oficina → 42501) ya
// la cubre scripts/test-rls-visits-writes.mjs. Esto verifica que el panel ni
// siquiera ofrece esa opción.
//
// Uso: node scripts/test-visit-assignable-members.mjs

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const client = new Client({ connectionString: process.env.DATABASE_URL });
let failures = 0;
const log = (s) => console.log(s);
const check = (ok, msg) => {
  if (!ok) failures++;
  log(`      ${ok ? '✓' : '✗✗'} ${msg}`);
};

async function txAs(authUserId, fn) {
  await client.query('BEGIN');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUserId, role: 'authenticated' }),
  ]);
  await client.query('SET LOCAL ROLE authenticated');
  try {
    return await fn();
  } finally {
    await client.query('ROLLBACK').catch(() => {});
  }
}

// Reproduce EXACTAMENTE las dos queries de listAssignableMembers() para un do,
// ejecutadas como el do vía anon + RLS (uoa_select es tenant-wide).
async function allowedAsDo(authUserId, userId) {
  return txAs(authUserId, async () => {
    const { rows: mine } = await client.query(
      'SELECT office_id FROM public.user_office_assignments WHERE user_id = $1',
      [userId],
    );
    const officeIds = [...new Set(mine.map((r) => Number(r.office_id)))];
    if (officeIds.length === 0) return { officeIds, allowed: new Set() };
    const { rows: peers } = await client.query(
      'SELECT user_id FROM public.user_office_assignments WHERE office_id = ANY($1::bigint[])',
      [officeIds],
    );
    return { officeIds, allowed: new Set(peers.map((r) => Number(r.user_id))) };
  });
}

try {
  await client.connect();

  const { rows: dofis } = await client.query(
    `SELECT id, auth_user_id, tenant_id, full_name FROM public.users
       WHERE role = 'director_oficina' AND active = true ORDER BY id`,
  );
  if (dofis.length === 0) throw new Error('seed sin director_oficina');

  log(`\n=== /visits · comerciales asignables por director_oficina (espejo RLS 015) ===`);

  for (const dofi of dofis) {
    log(`\n  · do: ${dofi.full_name} (users.id=${dofi.id})`);

    // --- Expectativas (raw client = owner, bypassa RLS) ---
    const { rows: doOfficeRows } = await client.query(
      'SELECT office_id FROM public.user_office_assignments WHERE user_id = $1',
      [dofi.id],
    );
    const doOffices = new Set(doOfficeRows.map((r) => Number(r.office_id)));

    const { rows: comercials } = await client.query(
      `SELECT u.id, u.full_name, array_remove(array_agg(DISTINCT uoa.office_id), NULL) AS offices
         FROM public.users u
         LEFT JOIN public.user_office_assignments uoa ON uoa.user_id = u.id
        WHERE u.role = 'comercial' AND u.active = true AND u.tenant_id = $1
        GROUP BY u.id, u.full_name`,
      [dofi.tenant_id],
    );
    const inDoOffice = (c) => (c.offices || []).some((o) => doOffices.has(Number(o)));
    const sameOffice = comercials.filter(inDoOffice);
    const foreign = comercials.filter((c) => !inDoOffice(c));

    // --- Set real que el panel derivaría (impersonando al do, anon + RLS) ---
    const { officeIds, allowed } = await allowedAsDo(dofi.auth_user_id, dofi.id);
    log(`      oficinas=[${officeIds.join(', ')}] · asignables=${allowed.size}`);

    // --- Aserciones ---
    check(allowed.size > 0, `set no vacío (${allowed.size})`);
    check(allowed.has(Number(dofi.id)), 'el do se incluye a sí mismo (default «yo»)');

    check(sameOffice.length > 0, `tiene comerciales en su oficina (${sameOffice.length})`);
    const missing = sameOffice.filter((c) => !allowed.has(Number(c.id)));
    check(
      missing.length === 0,
      `incluye a TODOS los de su oficina${missing.length ? ' — faltan: ' + missing.map((c) => c.full_name).join(', ') : ''}`,
    );

    check(foreign.length > 0, `hay comerciales de otra oficina para excluir (${foreign.length})`);
    const leaked = foreign.filter((c) => allowed.has(Number(c.id)));
    check(
      leaked.length === 0,
      `excluye a los de otra oficina${leaked.length ? ' — se cuela: ' + leaked.map((c) => c.full_name).join(', ') : ''}`,
    );

    // --- El foráneo es VISIBLE en users pero NO asignable → el filtro trabaja ---
    if (foreign[0]) {
      const visible = await txAs(dofi.auth_user_id, async () => {
        const { rows } = await client.query(
          'SELECT count(*)::int AS n FROM public.users WHERE id = $1',
          [foreign[0].id],
        );
        return rows[0].n === 1;
      });
      check(
        visible && !allowed.has(Number(foreign[0].id)),
        `${foreign[0].full_name} (otra oficina): VISIBLE para el do pero NO asignable`,
      );
    }
  }

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓ (todas las expectativas se cumplen)' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
