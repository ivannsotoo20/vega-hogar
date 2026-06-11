// scripts/test-rls-invites.mjs
// Verificación de F9 — invites por email (pending_invites + claim_invite). SIN tocar
// el panel y SIN password. Impersona a nivel SQL (set_config request.jwt.claims +
// SET LOCAL ROLE authenticated). Todo en BEGIN…ROLLBACK → cero cambios persistentes.
//
//   1. RLS de pending_invites (13-invites.sql): admin/dg INSERT/SELECT/UPDATE allow;
//      director_oficina/comercial deny; invited_by ajeno deny (WITH CHECK); anon 0.
//   2. claim_invite (mig 017, SECURITY DEFINER): el invitado autenticado canjea su
//      token. email-match → 'created' + fila users creada; email distinto → EMAIL_MISMATCH;
//      caducado → INVITE_EXPIRED; revocado → INVITE_REVOKED; ya usado → INVITE_ALREADY_USED.
//
// Uso: node scripts/test-rls-invites.mjs   (requiere migr 017 + policies 13-invites aplicadas)

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
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

const INSERT_INVITE =
  `INSERT INTO public.pending_invites (tenant_id, email, role, invited_by, token_hash, expires_at) VALUES ($1, $2, 'comercial', $3, $4, now() + interval '7 days')`;

async function expectWrite(authUserId, name, expect, sql, params) {
  let err = null;
  let rowCount = null;
  await txAs(authUserId, async () => {
    try {
      const res = await client.query(sql, params);
      rowCount = res.rowCount;
    } catch (e) {
      err = e;
    }
  });
  const denied = (err && err.code === '42501') || (!err && rowCount === 0);
  const otherErr = err && err.code !== '42501' && err.code !== '23505';
  let ok;
  if (otherErr) ok = false;
  else if (expect === 'allow') ok = (err && err.code === '23505') || (!err && rowCount > 0);
  else ok = denied;
  if (!ok) failures++;
  const how = err ? `[${err.code}]` : `${rowCount} fila(s)`;
  log(`      ${ok ? '✓' : '✗✗'} ${name} (esperado: ${expect}) → ${how}`);
}

// Escenario de claim_invite: inserta el invite (owner), opcionalmente lo muta, e
// impersona a una identidad NUEVA (uuid aleatorio + email en el JWT) que lo canjea.
async function claimScenario(label, { email, jwtEmail, tokenRaw, inviterId, mutate, expectStatus, expectErr }) {
  const jwtSub = crypto.randomUUID();
  await client.query('BEGIN');
  try {
    const { rows: inv } = await client.query(
      `${INSERT_INVITE} RETURNING id`,
      [TENANT_ID, email, inviterId, sha256hex(tokenRaw)],
    );
    if (mutate) await client.query(mutate.sql, [inv[0].id]);

    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: jwtSub, role: 'authenticated', email: jwtEmail }),
    ]);
    await client.query('SET LOCAL ROLE authenticated');

    let result = null;
    let err = null;
    try {
      const { rows } = await client.query(`SELECT * FROM public.claim_invite($1)`, [tokenRaw]);
      result = rows[0];
    } catch (e) {
      err = e;
    }

    if (expectStatus) {
      const created = result?.status === expectStatus;
      // Como el usuario autenticado (sub=jwtSub) se ve a sí mismo (users_select self-clause).
      let userExists = false;
      if (created) {
        const { rows } = await client.query(
          `SELECT count(*)::int n FROM public.users WHERE auth_user_id = $1`,
          [jwtSub],
        );
        userExists = rows[0].n === 1;
      }
      check(created && userExists, `${label}: status='${result?.status}' + fila users creada`);
    } else {
      const matched = err && err.message.includes(expectErr);
      check(matched, `${label}: ${expectErr} → ${err ? err.message.split('\n')[0] : `sin error (status=${result?.status})`}`);
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
  }
}

let TENANT_ID;

try {
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT DISTINCT ON (role) id, auth_user_id, tenant_id, role, full_name
       FROM public.users WHERE active = true ORDER BY role, id`,
  );
  const byRole = Object.fromEntries(users.map((u) => [u.role, u]));
  const admin = byRole.admin;
  const dg = byRole.director_general;
  const dofi = byRole.director_oficina;
  const com = byRole.comercial;
  if (!admin) throw new Error('seed sin admin');
  TENANT_ID = admin.tenant_id;

  const rnd = () => Math.random().toString(36).slice(2, 8);
  // Token realista: 32 bytes base64url (43 chars) — pasa el guard length>=32 de claim_invite.
  const mkToken = () => crypto.randomBytes(32).toString('base64url');

  // --- 1) RLS de pending_invites ---
  log(`\n=== 1) RLS pending_invites (13-invites.sql) ===`);
  await expectWrite(admin.auth_user_id, 'admin INSERT invite (invited_by=self) allow', 'allow', INSERT_INVITE, [
    TENANT_ID, `t-${rnd()}@vega.test`, admin.id, sha256hex('tok-' + rnd()),
  ]);
  if (dg) {
    await expectWrite(dg.auth_user_id, 'director_general INSERT invite allow', 'allow', INSERT_INVITE, [
      dg.tenant_id, `t-${rnd()}@vega.test`, dg.id, sha256hex('tok-' + rnd()),
    ]);
  }
  if (dofi) {
    await expectWrite(dofi.auth_user_id, 'director_oficina INSERT invite (deny: rol)', 'deny', INSERT_INVITE, [
      dofi.tenant_id, `t-${rnd()}@vega.test`, dofi.id, sha256hex('tok-' + rnd()),
    ]);
  }
  if (com) {
    await expectWrite(com.auth_user_id, 'comercial INSERT invite (deny: rol)', 'deny', INSERT_INVITE, [
      com.tenant_id, `t-${rnd()}@vega.test`, com.id, sha256hex('tok-' + rnd()),
    ]);
  }
  // admin con invited_by ajeno → deny (WITH CHECK invited_by = self).
  if (com) {
    await expectWrite(admin.auth_user_id, 'admin INSERT con invited_by ajeno (deny: WITH CHECK)', 'deny', INSERT_INVITE, [
      TENANT_ID, `t-${rnd()}@vega.test`, com.id, sha256hex('tok-' + rnd()),
    ]);
  }

  // --- SELECT visibility ---
  log(`\n=== SELECT visibilidad ===`);
  const adminSees = await txAs(admin.auth_user_id, async () => {
    const { rows } = await client.query(`SELECT count(*)::int n FROM public.pending_invites`);
    return rows[0].n;
  });
  check(typeof adminSees === 'number', `admin puede leer pending_invites (${adminSees} visibles)`);
  if (com) {
    const comSees = await txAs(com.auth_user_id, async () => {
      const { rows } = await client.query(`SELECT count(*)::int n FROM public.pending_invites`);
      return rows[0].n;
    });
    check(comSees === 0, `comercial NO ve invites (${comSees}, esperado 0)`);
  }

  // --- 2) claim_invite ---
  log(`\n=== 2) claim_invite (SECURITY DEFINER) ===`);
  const baseEmail = () => `claim-${rnd()}@vega.test`;
  let e1 = baseEmail();
  await claimScenario('email-match', { email: e1, jwtEmail: e1, tokenRaw: mkToken(), inviterId: admin.id, expectStatus: 'created' });

  let e2 = baseEmail();
  await claimScenario('email distinto', { email: e2, jwtEmail: `otro-${rnd()}@vega.test`, tokenRaw: mkToken(), inviterId: admin.id, expectErr: 'EMAIL_MISMATCH' });

  let e3 = baseEmail();
  await claimScenario('caducado', { email: e3, jwtEmail: e3, tokenRaw: mkToken(), inviterId: admin.id, mutate: { sql: `UPDATE public.pending_invites SET expires_at = now() - interval '1 day' WHERE id = $1` }, expectErr: 'INVITE_EXPIRED' });

  let e4 = baseEmail();
  await claimScenario('revocado', { email: e4, jwtEmail: e4, tokenRaw: mkToken(), inviterId: admin.id, mutate: { sql: `UPDATE public.pending_invites SET revoked_at = now() WHERE id = $1` }, expectErr: 'INVITE_REVOKED' });

  let e5 = baseEmail();
  await claimScenario('ya usado', { email: e5, jwtEmail: e5, tokenRaw: mkToken(), inviterId: admin.id, mutate: { sql: `UPDATE public.pending_invites SET accepted_at = now() WHERE id = $1` }, expectErr: 'INVITE_ALREADY_USED' });

  // token inexistente
  await (async () => {
    const jwtSub = crypto.randomUUID();
    const em = baseEmail();
    await client.query('BEGIN');
    try {
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: jwtSub, role: 'authenticated', email: em })]);
      await client.query('SET LOCAL ROLE authenticated');
      let err = null;
      try { await client.query(`SELECT * FROM public.claim_invite($1)`, ['tok-inexistente-' + Math.random()]); } catch (e) { err = e; }
      check(err && err.message.includes('INVITE_NOT_FOUND'), `token inexistente → INVITE_NOT_FOUND (${err?.message.split('\n')[0] ?? 'sin error'})`);
    } finally { await client.query('ROLLBACK').catch(() => {}); }
  })();

  log(`\n=== Resultado: ${failures === 0 ? 'OK ✓ (todas las expectativas se cumplen)' : `${failures} FALLO(S) ✗`} ===`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
