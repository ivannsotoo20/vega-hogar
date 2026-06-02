import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

/**
 * Fallback de /dashboard. El middleware raíz normalmente intercepta esta ruta
 * y redirige al subdashboard del rol. Esta page solo se ejecuta si el middleware
 * fallase — repite la lógica como defense in depth.
 */
export default async function DashboardFallback() {
  const current = await getCurrentUser();
  if (!current) {
    redirect('/login');
  }

  const targetByRole: Record<string, string> = {
    admin: '/director/dashboard',
    director_general: '/director/dashboard',
    director_oficina: '/oficina/dashboard',
    comercial: '/comercial/dashboard',
    asistente_captador: '/comercial/dashboard',
  };

  const target = targetByRole[current.profile.role] ?? '/login?error=no_profile';
  redirect(target);
}
