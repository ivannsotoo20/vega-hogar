'use server';

/**
 * F9 / S9 — Invitaciones por email (alta de miembros sobre el auth magic-link SSR).
 *
 * Decisión #3/#3b: el admin/dg crea el invite (anon+RLS, `pending_invites`) y obtiene
 * un ENLACE COPIABLE `/accept-invite?token=<raw>` que envía él (sin email automático).
 * El token en claro se devuelve UNA vez (solo se persiste su sha256). La aceptación
 * (signUp anon + `claim_invite` SECURITY DEFINER) ocurre en `app/accept-invite`.
 *
 * Gate: admin/director_general (matriz `admin.users.invite`) vía requireTenantRoleAtLeast
 * ('owner' = nivel ≥4). Anti-escalada: el rol invitado no puede superar al del invitador.
 * NUNCA service-role. Nunca se loggea el token/url. Deny RLS de UPDATE = 0 filas.
 */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import crypto from 'node:crypto';

import type { EffectiveTenant } from '@/lib/auth/effective-tenant';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { AuthError, requireTenantRoleAtLeast } from '@/lib/auth/require-tenant-role';
import { ROLE_HIERARCHY, type UserRole } from '@/lib/auth/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface InviteRow {
  id: number;
  email: string;
  role: UserRole;
  officeId: number | null;
  createdAt: string;
  expiresAt: string;
  state: 'active' | 'accepted' | 'revoked' | 'expired';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITABLE_ROLES: readonly UserRole[] = [
  'director_general',
  'director_oficina',
  'comercial',
  'asistente_captador',
  'admin',
];
const TTL_DAYS = 7;

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

type ManageAuth =
  | { ok: true; eff: EffectiveTenant; supabase: ServerClient }
  | { ok: false; error: string };

/** Gate admin/director_general (nivel ≥4). RLS = última defensa. */
async function authorizeManage(): Promise<ManageAuth> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };
  try {
    await requireTenantRoleAtLeast({ tenantId: eff.tenantId, minRole: 'owner' });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.code };
    throw e;
  }
  const supabase = await createSupabaseServerClient();
  return { ok: true, eff, supabase };
}

function deriveState(row: Record<string, unknown>): InviteRow['state'] {
  if (row.revoked_at != null) return 'revoked';
  if (row.accepted_at != null) return 'accepted';
  if (new Date(String(row.expires_at)).getTime() < Date.now()) return 'expired';
  return 'active';
}

// ---------------------------------------------------------------------------
// createInvite — genera token (raw devuelto una vez) + guarda hash
// ---------------------------------------------------------------------------

export async function createInvite(input: {
  email: string;
  role: UserRole;
  officeId?: number | null;
}): Promise<ActionResult<{ inviteId: number; token: string; acceptUrl: string; expiresAt: string }>> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const email = String(input.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'invalid_email' };
  if (!INVITABLE_ROLES.includes(input.role)) return { ok: false, error: 'invalid_role' };

  // Anti-escalada: no se puede invitar a un rol superior al propio.
  if (ROLE_HIERARCHY[input.role] > ROLE_HIERARCHY[eff.role]) {
    return { ok: false, error: 'ROLE_TOO_HIGH' };
  }

  const officeId = input.officeId != null ? Number(input.officeId) : null;
  if (officeId != null && (!Number.isFinite(officeId) || officeId <= 0)) {
    return { ok: false, error: 'invalid_officeId' };
  }

  const token = crypto.randomBytes(32).toString('base64url'); // 43 chars
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('pending_invites')
    .insert({
      tenant_id: eff.tenantId,
      email,
      role: input.role,
      office_id: officeId,
      invited_by: eff.userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'ALREADY_ACTIVE' };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: 'insert_failed' };

  const origin = await getOrigin();
  const acceptUrl = `${origin}/accept-invite?token=${token}`;

  revalidatePath('/settings/members');
  return { ok: true, data: { inviteId: Number(data.id), token, acceptUrl, expiresAt } };
}

// ---------------------------------------------------------------------------
// listInvites — invites del tenant (RLS admin/dg)
// ---------------------------------------------------------------------------

export async function listInvites(): Promise<ActionResult<InviteRow[]>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('pending_invites')
    .select('id, email, role, office_id, created_at, expires_at, accepted_at, revoked_at')
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };

  const rows: InviteRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    role: String(r.role) as UserRole,
    officeId: r.office_id != null ? Number(r.office_id) : null,
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
    state: deriveState(r),
  }));
  return { ok: true, data: rows };
}

// ---------------------------------------------------------------------------
// revokeInvite — marca revoked_at (soft, audit-trail)
// ---------------------------------------------------------------------------

export async function revokeInvite(inviteId: number): Promise<ActionResult> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;

  const id = Number(inviteId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'invalid_inviteId' };

  const { data, error } = await auth.supabase
    .from('pending_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
    .is('accepted_at', null)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'not_found_or_inactive' };

  revalidatePath('/settings/members');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// resendInvite — revoca el activo y crea uno nuevo (token nuevo)
// ---------------------------------------------------------------------------

export async function resendInvite(
  inviteId: number,
): Promise<ActionResult<{ token: string; acceptUrl: string; expiresAt: string }>> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;

  const id = Number(inviteId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'invalid_inviteId' };

  // Cargar el invite (RLS admin/dg) para reemitir con sus mismos datos.
  const { data: inv, error: selErr } = await auth.supabase
    .from('pending_invites')
    .select('email, role, office_id, accepted_at')
    .eq('id', id)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };
  if (!inv) return { ok: false, error: 'not_found' };
  if ((inv as { accepted_at: string | null }).accepted_at != null) {
    return { ok: false, error: 'already_accepted' };
  }

  // Revocar el actual (idempotente) y crear uno nuevo.
  await auth.supabase
    .from('pending_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null);

  const row = inv as { email: string; role: UserRole; office_id: number | null };
  return createInvite({ email: row.email, role: row.role, officeId: row.office_id });
}
