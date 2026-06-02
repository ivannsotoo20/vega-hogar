import { getCurrentUser } from './getCurrentUser';
import { resolveEffectiveTenantId } from './impersonate';
import type { UserRole } from './types';

/**
 * Contexto de tenant efectivo para Server Components tenant-scoped (shim de port
 * de SETTER, reescrito sobre el modelo de Vega).
 *
 * Reutiliza `getCurrentUser()` (anon + RLS, cacheado por React.cache) — NO usa
 * service-role (regla 2 del CLAUDE.md: service-role solo en el motor).
 *
 * Expone tanto `userId` (BigInt `users.id`, para escribir asignaciones) como
 * `authUserId` (UUID `auth.users.id`). SETTER usaba solo el UUID de `profiles`;
 * en Vega la autoría/asignación va por `users.id` BigInt.
 */
export interface EffectiveTenant {
  /** `users.id` (BigInt). Úsalo para FKs de asignación/autoría. */
  userId: number;
  /** `auth.users.id` (UUID). */
  authUserId: string;
  /** Tenant EFECTIVO (el impersonado si aplica; si no, el natural). */
  tenantId: number;
  /** Rol del usuario en SU tenant natural (no en el impersonado). */
  role: UserRole;
  isAgencyAdmin: boolean;
  isImpersonating: boolean;
  email: string;
}

export async function getEffectiveTenant(): Promise<EffectiveTenant | null> {
  const current = await getCurrentUser();
  if (!current) return null;

  const { profile } = current;
  if (!profile.active) return null;

  const { tenantId, isImpersonating } = await resolveEffectiveTenantId({
    profileTenantId: profile.tenantId,
    isAgencyAdmin: profile.isAgencyAdmin,
  });

  return {
    userId: profile.id,
    authUserId: profile.authUserId,
    tenantId,
    role: profile.role,
    isAgencyAdmin: profile.isAgencyAdmin,
    isImpersonating,
    email: profile.email,
  };
}
