'use server';

/**
 * F5 / S4 — Miembros (usuarios activos) del tenant para asignación y filtros en
 * `/leads`. Lectura anon + RLS (`users_select` devuelve solo usuarios del tenant).
 * NUNCA service-role. `id` es BIGINT (FK de asignación a nivel lead).
 */

import { revalidatePath } from 'next/cache';

import type { EffectiveTenant } from '@/lib/auth/effective-tenant';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { AuthError, requireTenantRoleAtLeast } from '@/lib/auth/require-tenant-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ROLE_HIERARCHY, type UserRole } from '@/lib/auth/types';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface MemberOption {
  id: number;
  fullName: string | null;
  email: string;
  role: UserRole;
}

export type MembersResult = { ok: true; data: MemberOption[] } | { ok: false; error: string };
export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function listMembers(): Promise<MembersResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role')
    .eq('active', true)
    .order('full_name', { ascending: true });
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    ok: true,
    data: rows.map((r) => ({
      id: Number(r.id),
      fullName: (r.full_name as string | null) ?? null,
      email: String(r.email),
      role: String(r.role) as UserRole,
    })),
  };
}

/**
 * F8.1 — Miembros a los que el viewer puede ASIGNAR una visita. Espejo (a nivel
 * UX) del scope de ESCRITURA de la RLS de `visits` (migración 015 /
 * `packages/db/policies/05-visits.sql`), para que el Select de comercial del alta
 * (`AddVisitDialog`) y el dropdown «Reasignar» (`visit-detail`) NO ofrezcan
 * opciones que la RLS rechazaría con 42501:
 *   · admin / director_general / asistente_captador → todos (la RLS de escritura
 *     les permite cualquier `comercial_user_id` del tenant).
 *   · director_oficina → solo los de su(s) oficina(s), incluido él mismo (mismo
 *     predicado `user_office_assignments` que `visits_insert/_update`).
 *   · comercial → solo él mismo (el picker está oculto; mantenemos el contrato).
 *
 * NO sustituye a la RLS (que sigue siendo la última línea); es UX para que el
 * papercut «elijo a alguien de otra oficina → toast de error» no ocurra.
 *
 * Lectura anon + RLS: `uoa_select` deja a cualquier miembro del tenant leer toda
 * la tabla `user_office_assignments`. NUNCA service-role.
 */
export async function listAssignableMembers(): Promise<MembersResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const all = await listMembers();
  if (!all.ok) return all;

  // Roles con scope de escritura amplio → todos los miembros del tenant.
  if (
    eff.role === 'admin' ||
    eff.role === 'director_general' ||
    eff.role === 'asistente_captador'
  ) {
    return all;
  }

  // comercial → solo se autoasigna.
  if (eff.role === 'comercial') {
    return { ok: true, data: all.data.filter((m) => m.id === eff.userId) };
  }

  // director_oficina → comerciales que comparten su(s) oficina(s) (incluido él).
  const supabase = await createSupabaseServerClient();

  const { data: mine, error: officesErr } = await supabase
    .from('user_office_assignments')
    .select('office_id')
    .eq('user_id', eff.userId);
  if (officesErr) return { ok: false, error: officesErr.message };

  const officeIds = Array.from(
    new Set((mine ?? []).map((r) => Number((r as { office_id: unknown }).office_id))),
  );
  if (officeIds.length === 0) {
    // do sin oficina asignada (no debería ocurrir con el seed) → solo él mismo,
    // para no dejar el Select vacío y romper el default «yo» del diálogo.
    return { ok: true, data: all.data.filter((m) => m.id === eff.userId) };
  }

  const { data: peers, error: peersErr } = await supabase
    .from('user_office_assignments')
    .select('user_id')
    .in('office_id', officeIds);
  if (peersErr) return { ok: false, error: peersErr.message };

  const allowed = new Set((peers ?? []).map((r) => Number((r as { user_id: unknown }).user_id)));
  return { ok: true, data: all.data.filter((m) => allowed.has(m.id)) };
}

/**
 * F9 / S5 — Alterna el flag `is_agency_admin` de un usuario (`/admin/admins`).
 * Acto agency-level → gate admin EXACTO (la RLS `users_update` también admite
 * director_general, pero conceder/revocar agency-admin es solo de admin).
 * Guards de app (RLS = última línea):
 *   · no puedes quitarte el flag a ti mismo (evita auto-bloqueo);
 *   · no puedes dejar 0 agency-admins (cuenta scoped por RLS al tenant).
 * Deny RLS de UPDATE = 0 filas (no 42501) → comprobamos `.select()` posterior.
 * anon + RLS, NUNCA service-role.
 */
export async function setAgencyAdmin(input: {
  userId: number;
  isAgencyAdmin: boolean;
}): Promise<ActionResult<{ updated: true }>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };
  if (eff.role !== 'admin') return { ok: false, error: 'FORBIDDEN_ROLE_REQUIRED' };

  const userId = Number(input.userId);
  if (!Number.isFinite(userId) || userId <= 0) return { ok: false, error: 'invalid_userId' };

  if (input.isAgencyAdmin === false) {
    if (userId === eff.userId) return { ok: false, error: 'cannot_demote_self' };
    const supabaseChk = await createSupabaseServerClient();
    const { count, error: cntErr } = await supabaseChk
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('is_agency_admin', true)
      .eq('active', true);
    if (cntErr) return { ok: false, error: cntErr.message };
    if ((count ?? 0) <= 1) return { ok: false, error: 'last_agency_admin' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('users')
    .update({ is_agency_admin: input.isAgencyAdmin })
    .eq('id', userId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'not_found' };

  revalidatePath('/admin/admins');
  return { ok: true, data: { updated: true } };
}

// ===========================================================================
// F9 / S9 — Gestión de miembros (/settings/members). Gate admin/director_general
// (matriz admin.users.* + RLS users_update/uoa_modify). Guards de app + RLS última línea.
// ===========================================================================

const VALID_ROLES: readonly UserRole[] = [
  'admin',
  'director_general',
  'director_oficina',
  'comercial',
  'asistente_captador',
];

type ManageAuth =
  | { ok: true; eff: EffectiveTenant; supabase: ServerClient }
  | { ok: false; error: string };

async function authorizeManage(): Promise<ManageAuth> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };
  try {
    await requireTenantRoleAtLeast({ tenantId: eff.tenantId, minRole: 'owner' }); // ≥ director_general
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.code };
    throw e;
  }
  const supabase = await createSupabaseServerClient();
  return { ok: true, eff, supabase };
}

/** Nº de admins activos del tenant (RLS-scoped). Para el guard "último admin". */
async function activeAdminCount(supabase: ServerClient): Promise<number> {
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('active', true);
  return count ?? 0;
}

export async function updateMemberRole(
  userId: number,
  role: UserRole,
): Promise<ActionResult<{ updated: true }>> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'invalid_userId' };
  if (!VALID_ROLES.includes(role)) return { ok: false, error: 'invalid_role' };
  // No conceder un rol superior al propio.
  if (ROLE_HIERARCHY[role] > ROLE_HIERARCHY[eff.role]) return { ok: false, error: 'ROLE_TOO_HIGH' };

  // Si se degrada al ÚLTIMO admin activo → bloquear.
  const { data: cur } = await supabase.from('users').select('role').eq('id', id).maybeSingle();
  const curRole = cur ? String((cur as { role: string }).role) : null;
  if (curRole === 'admin' && role !== 'admin' && (await activeAdminCount(supabase)) <= 1) {
    return { ok: false, error: 'last_admin' };
  }

  const { data, error } = await supabase.from('users').update({ role }).eq('id', id).select('id');
  if (error) return { ok: false, error: error.message };
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'not_found' };

  revalidatePath('/settings/members');
  return { ok: true, data: { updated: true } };
}

export async function toggleMemberActive(
  userId: number,
  active: boolean,
): Promise<ActionResult<{ updated: true }>> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'invalid_userId' };

  if (active === false) {
    if (id === eff.userId) return { ok: false, error: 'cannot_deactivate_self' };
    const { data: cur } = await supabase.from('users').select('role').eq('id', id).maybeSingle();
    const curRole = cur ? String((cur as { role: string }).role) : null;
    if (curRole === 'admin' && (await activeAdminCount(supabase)) <= 1) {
      return { ok: false, error: 'last_admin' };
    }
  }

  const { data, error } = await supabase.from('users').update({ active }).eq('id', id).select('id');
  if (error) return { ok: false, error: error.message };
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'not_found' };

  revalidatePath('/settings/members');
  return { ok: true, data: { updated: true } };
}

export async function assignMemberOffice(
  userId: number,
  officeId: number,
): Promise<ActionResult<{ assigned: true }>> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const uid = Number(userId);
  const oid = Number(officeId);
  if (!Number.isFinite(uid) || uid <= 0) return { ok: false, error: 'invalid_userId' };
  if (!Number.isFinite(oid) || oid <= 0) return { ok: false, error: 'invalid_officeId' };

  // Oficina debe existir en el tenant (offices_select escopa al tenant).
  const { data: office } = await supabase.from('offices').select('id').eq('id', oid).maybeSingle();
  if (!office) return { ok: false, error: 'office_not_in_tenant' };

  // is_primary = true si es su primera oficina.
  const { count } = await supabase
    .from('user_office_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid);

  const { error } = await supabase.from('user_office_assignments').insert({
    tenant_id: eff.tenantId,
    user_id: uid,
    office_id: oid,
    is_primary: (count ?? 0) === 0,
  });
  if (error) {
    if (error.code === '23505') {
      revalidatePath('/settings/members');
      return { ok: true, data: { assigned: true } }; // ya asignada (idempotente)
    }
    if (error.code === '42501') return { ok: false, error: 'denied' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings/members');
  return { ok: true, data: { assigned: true } };
}

export async function unassignMemberOffice(
  userId: number,
  officeId: number,
): Promise<ActionResult<{ unassigned: true }>> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const uid = Number(userId);
  const oid = Number(officeId);
  if (!Number.isFinite(uid) || uid <= 0) return { ok: false, error: 'invalid_userId' };
  if (!Number.isFinite(oid) || oid <= 0) return { ok: false, error: 'invalid_officeId' };

  const { error } = await supabase
    .from('user_office_assignments')
    .delete()
    .eq('user_id', uid)
    .eq('office_id', oid);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/members');
  return { ok: true, data: { unassigned: true } }; // 0 filas = no estaba asignada (idempotente)
}
