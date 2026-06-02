import { cookies } from 'next/headers';

/**
 * Impersonación de tenant para el agency-admin de Fyzon (port de SETTER).
 *
 * Cuando un agency-admin entra "como [inmobiliaria X]" desde `/admin/tenants/[id]`,
 * esta cookie guarda el `tenant_id` de esa inmobiliaria. Las páginas tenant-scoped
 * resuelven el tenant efectivo con `getEffectiveTenant()` en vez de leer el
 * `tenant_id` natural del profile.
 *
 * Diferencia con SETTER: Vega es single-domain (no hay admin.fyzon/panel.fyzon),
 * así que la cookie NO lleva `domain` — vive en el dominio del panel.
 *
 * NOTA Fase 3: la mecánica está lista, pero el cross-tenant real (leer datos de
 * OTRO tenant) lo bloquea RLS hasta que en Fase 4 se añada la policy de
 * agency-admin. En Fase 3 impersonar otro tenant no devuelve filas (esperado).
 *
 * Seguridad: el backend SIEMPRE valida `is_agency_admin` antes de respetar la
 * cookie — un usuario normal con esa cookie no puede impersonar.
 */

const COOKIE_NAME = 'vega_impersonate_tenant_id';

export async function getImpersonateTenantId(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setImpersonateTenantId(tenantId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, String(tenantId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h
  });
}

export async function clearImpersonateTenantId(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Tenant efectivo:
 *   - Sin cookie → tenant natural del profile.
 *   - Con cookie Y agency-admin → tenant de la cookie.
 *   - Con cookie pero NO agency-admin → ignora cookie.
 */
export async function resolveEffectiveTenantId(args: {
  profileTenantId: number;
  isAgencyAdmin: boolean;
}): Promise<{ tenantId: number; isImpersonating: boolean }> {
  if (!args.isAgencyAdmin) {
    return { tenantId: args.profileTenantId, isImpersonating: false };
  }
  const impersonateId = await getImpersonateTenantId();
  if (impersonateId == null || impersonateId === args.profileTenantId) {
    return { tenantId: args.profileTenantId, isImpersonating: false };
  }
  return { tenantId: impersonateId, isImpersonating: true };
}
