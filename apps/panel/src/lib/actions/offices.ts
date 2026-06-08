'use server';

/**
 * F7 — Oficinas activas del tenant para el Select de alta de inmuebles
 * (`properties.office_id` es NOT NULL y el shim no expone oficina; usuario↔oficina
 * es N:M vía `user_office_assignments`). Lectura anon + RLS (`offices_select`
 * devuelve solo oficinas del tenant). NUNCA service-role. `id` es BIGINT.
 */

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface OfficeOption {
  id: number;
  name: string;
  slug: string;
}

export type OfficesResult = { ok: true; data: OfficeOption[] } | { ok: false; error: string };

export async function listOffices(): Promise<OfficesResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('offices')
    .select('id, name, slug')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    ok: true,
    data: rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      slug: String(r.slug),
    })),
  };
}
