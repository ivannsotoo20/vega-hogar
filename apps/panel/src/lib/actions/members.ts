'use server';

/**
 * F5 / S4 — Miembros (usuarios activos) del tenant para asignación y filtros en
 * `/leads`. Lectura anon + RLS (`users_select` devuelve solo usuarios del tenant).
 * NUNCA service-role. `id` es BIGINT (FK de asignación a nivel lead).
 */

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/auth/types';

export interface MemberOption {
  id: number;
  fullName: string | null;
  email: string;
  role: UserRole;
}

export type MembersResult = { ok: true; data: MemberOption[] } | { ok: false; error: string };

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
