import { redirect } from 'next/navigation';
import { getCurrentUser } from './getCurrentUser';
import { ROLE_HIERARCHY, type UserProfile, type UserRole } from './types';

/**
 * Garantiza que el request tiene un usuario autenticado activo con rol
 * suficiente. Si falla, redirige (lanza, no devuelve).
 *
 * - Sin sesión → /login.
 * - Profile inactivo → /login?error=inactive (sin signOut aquí; el middleware
 *   raíz hace el signOut en su pasada — esta función solo redirige).
 * - Rol insuficiente → /dashboard?error=forbidden.
 *
 * Si `min` es array, basta con que el rol del usuario coincida con CUALQUIERA
 * de ellos (match exacto). Si es un único `UserRole`, se aplica jerarquía
 * `ROLE_HIERARCHY`.
 *
 * Devuelve el profile validado para uso inmediato en el server component.
 */
export async function requireRole(
  min: UserRole | UserRole[],
): Promise<UserProfile> {
  const current = await getCurrentUser();

  if (!current) {
    redirect('/login');
  }

  const { profile } = current;

  if (!profile.active) {
    redirect('/login?error=inactive');
  }

  if (Array.isArray(min)) {
    if (!min.includes(profile.role)) {
      redirect('/dashboard?error=forbidden');
    }
  } else {
    const userLevel = ROLE_HIERARCHY[profile.role];
    const requiredLevel = ROLE_HIERARCHY[min];
    if (userLevel < requiredLevel) {
      redirect('/dashboard?error=forbidden');
    }
  }

  return profile;
}
