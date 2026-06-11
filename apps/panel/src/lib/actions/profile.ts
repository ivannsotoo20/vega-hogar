'use server';

/**
 * F9 / S6 — Acciones del perfil propio (`/settings/profile`).
 *
 * Subtileza RLS (01-identity.sql): `users_update` solo admite admin/director_general,
 * así que un comercial NO puede editar su propia fila `public.users` vía anon+RLS.
 * Solución v1 (sin nueva policy/trigger → sin superficie de escalada):
 *   · cambiar password → `auth.updateUser({ password })` (capa auth, self-service, todo rol);
 *   · nombre para mostrar → `auth.updateUser({ data: { full_name } })` (user_metadata, NO
 *     public.users). El `full_name` canónico de la organización lo gestiona admin/dg en
 *     /settings/members.
 * anon + RLS, NUNCA service-role.
 */

import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function changePassword(input: { newPassword: string }): Promise<ActionResult> {
  const current = await getCurrentUser();
  if (!current) return { ok: false, error: 'UNAUTHENTICATED' };

  const pw = String(input.newPassword ?? '');
  if (pw.length < 8) return { ok: false, error: 'password_too_short' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateDisplayName(input: { fullName: string }): Promise<ActionResult> {
  const current = await getCurrentUser();
  if (!current) return { ok: false, error: 'UNAUTHENTICATED' };

  const name = String(input.fullName ?? '').trim();
  if (name.length === 0 || name.length > 120) return { ok: false, error: 'invalid_name' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
