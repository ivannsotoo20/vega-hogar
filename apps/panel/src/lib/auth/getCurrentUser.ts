import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import type { UserProfile, UserRole } from './types';

interface CurrentUser {
  authUser: User;
  profile: UserProfile;
}

/**
 * Devuelve el auth user + el profile de `public.users` para el request actual.
 * Cacheado por React.cache (dura lo que el render). Idempotente.
 *
 * Devuelve null si no hay sesión o si el profile no existe.
 * NO redirige — esa responsabilidad es de `requireRole()`.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  const { data: row } = await supabase
    .from('users')
    .select('id, auth_user_id, tenant_id, email, full_name, role, active, is_agency_admin')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  if (!row) {
    return null;
  }

  const profile: UserProfile = {
    id: Number(row.id),
    authUserId: row.auth_user_id,
    tenantId: Number(row.tenant_id),
    email: row.email,
    fullName: row.full_name ?? null,
    role: row.role as UserRole,
    active: Boolean(row.active),
    isAgencyAdmin: Boolean(row.is_agency_admin),
  };

  return { authUser, profile };
});
