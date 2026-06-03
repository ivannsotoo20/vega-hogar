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
