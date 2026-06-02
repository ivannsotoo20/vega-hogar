import { getCurrentUser } from './getCurrentUser';
import { ROLE_HIERARCHY, type UserRole } from './types';

/**
 * Autorización tenant-scoped para Server Actions / Route Handlers (shim de port
 * de SETTER, reescrito sobre el modelo de Vega).
 *
 * SETTER hablaba en roles `owner | admin | viewer` + flag `is_agency_admin`.
 * Vega tiene 5 roles inmobiliarios jerárquicos. Este shim acepta el vocabulario
 * SETTER (`minRole`) y lo traduce a `ROLE_HIERARCHY` de Vega según el mapeo
 * congelado en docs/sops/fase-03-cimientos-port.md §2.2:
 *   owner  → director_general (nivel 4)
 *   admin  → director_oficina (nivel 3)
 *   viewer → comercial / asistente_captador (nivel 2)
 * `admin` de Vega (nivel 5) siempre pasa.
 *
 * Lanza `AuthError` con `code` semántico (no redirige — la capa caller decide
 * 403/toast). Las pages siguen usando `requireRole()` (redirect). Coexisten.
 *
 * anon + RLS vía `getCurrentUser()`. NO usa service-role (regla 2 del CLAUDE.md).
 */

export type SetterRole = 'owner' | 'admin' | 'viewer';

export class AuthError extends Error {
  constructor(
    public code:
      | 'UNAUTHENTICATED'
      | 'PROFILE_NOT_FOUND'
      | 'PROFILE_INACTIVE'
      | 'FORBIDDEN_WRONG_TENANT'
      | 'FORBIDDEN_ROLE_REQUIRED'
      | 'FORBIDDEN_AGENCY_ADMIN_REQUIRED',
    public required?: SetterRole,
  ) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface AuthorizedContext {
  /** `users.id` (BigInt) — para FKs de asignación/autoría. */
  userId: number;
  /** `auth.users.id` (UUID). */
  authUserId: string;
  email: string;
  /** Rol Vega real del usuario. */
  role: UserRole;
  isAgencyAdmin: boolean;
  /** Tenant natural del profile (no el impersonado). */
  tenantId: number;
}

/** Nivel mínimo en ROLE_HIERARCHY de Vega para cada minRole del vocabulario SETTER. */
const SETTER_MIN_LEVEL: Record<SetterRole, number> = {
  owner: 4, // director_general
  admin: 3, // director_oficina
  viewer: 2, // comercial / asistente_captador
};

async function loadContext(): Promise<AuthorizedContext> {
  const current = await getCurrentUser();
  if (!current) throw new AuthError('UNAUTHENTICATED');

  const { profile } = current;
  if (!profile.active) throw new AuthError('PROFILE_INACTIVE');

  return {
    userId: profile.id,
    authUserId: profile.authUserId,
    email: profile.email,
    role: profile.role,
    isAgencyAdmin: profile.isAgencyAdmin,
    tenantId: profile.tenantId,
  };
}

/**
 * Autoriza una acción tenant-scoped.
 *   - agency-admin pasa siempre (salvo `allowAgencyAdmin: false`).
 *   - si no, el tenant del profile debe coincidir con `args.tenantId`.
 *   - si se pasa `minRole`, el rol Vega debe alcanzar el nivel mínimo mapeado.
 */
export async function requireTenantRole(args: {
  tenantId: number;
  minRole?: SetterRole;
  allowAgencyAdmin?: boolean;
}): Promise<AuthorizedContext> {
  const ctx = await loadContext();

  if (ctx.isAgencyAdmin && args.allowAgencyAdmin !== false) {
    return ctx;
  }

  if (ctx.tenantId !== args.tenantId) {
    throw new AuthError('FORBIDDEN_WRONG_TENANT');
  }

  if (args.minRole && ROLE_HIERARCHY[ctx.role] < SETTER_MIN_LEVEL[args.minRole]) {
    throw new AuthError('FORBIDDEN_ROLE_REQUIRED', args.minRole);
  }

  return ctx;
}

/** Alias explícito: "este rol o superior". Misma semántica que requireTenantRole con minRole. */
export async function requireTenantRoleAtLeast(args: {
  tenantId: number;
  minRole: SetterRole;
  allowAgencyAdmin?: boolean;
}): Promise<AuthorizedContext> {
  return requireTenantRole(args);
}

/** Acciones SOLO agency-admin (gestión cross-tenant: sub-cuentas, overrides). */
export async function requireAgencyAdmin(): Promise<AuthorizedContext> {
  const ctx = await loadContext();
  if (!ctx.isAgencyAdmin) {
    throw new AuthError('FORBIDDEN_AGENCY_ADMIN_REQUIRED');
  }
  return ctx;
}
