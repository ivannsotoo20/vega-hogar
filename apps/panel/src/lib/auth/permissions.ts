/**
 * Matriz de permisos para visibilidad UI del panel Vega Hogar.
 *
 * ⚠️ IMPORTANTE: esta matriz controla qué botones, listados y elementos de
 * menú muestra el panel. La fuente de verdad de seguridad son las RLS policies
 * en `packages/db/policies/`. Una entrada `granted=true` no garantiza acceso a
 * la BD; una `granted=false` solo oculta el affordance — RLS sigue protegiendo
 * el row.
 *
 * Usar `getPermissionsForRole(role)` para cargar el set una vez y `can(set, key)`
 * para checks puntuales dentro de un server component. Cacheado por
 * React.cache (dura lo que el render).
 */

import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UserRole } from './types';

/**
 * Catálogo de permission keys conocidos. La tabla `permissions_matrix` puede
 * contener cualquier string, pero este catálogo lista los que el panel chequea
 * explícitamente. Mantener en sync con el seed (`scripts/seed-permissions-matrix.mjs`).
 */
export const PERMISSION_KEYS = [
  // Properties
  'properties.view',
  'properties.create',
  'properties.update',
  'properties.delete',
  // Leads
  'leads.view_assigned',
  'leads.view_office',
  'leads.view_tenant',
  'leads.create',
  'leads.assign',
  'leads.delete',
  // Visits
  'visits.view_own',
  'visits.view_office',
  'visits.create',
  'visits.reassign',
  // Integrations
  'integrations.view',
  'integrations.edit',
  // Admin
  'admin.users.view',
  'admin.users.invite',
  'admin.permissions_matrix.edit',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * Carga las permission keys con `granted=true` para el rol dado, restringido
 * al tenant del request (vía RLS). Devuelve un Set para chequeos O(1).
 */
export const getPermissionsForRole = cache(
  async (role: UserRole): Promise<Set<string>> => {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from('permissions_matrix')
      .select('permission_key')
      .eq('role', role)
      .eq('granted', true);

    if (error || !data) {
      // Tabla aún no existe (pre-S8) o RLS bloquea → set vacío seguro.
      return new Set();
    }

    return new Set(data.map((row) => row.permission_key));
  },
);

/** Helper sincrónico para chequear un permiso una vez cargado el set. */
export function can(permissions: Set<string>, key: PermissionKey): boolean {
  return permissions.has(key);
}
