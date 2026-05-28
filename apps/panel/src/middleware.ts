import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Middleware raíz Vega Hogar — auth gating + role-based redirect en /dashboard.
 *
 * Edge runtime. Mantener ligero:
 *   - Refresca cookie Supabase (updateSession → getUser).
 *   - Si ruta protegida sin sesión → /login.
 *   - Si ruta auth-only con sesión → /dashboard.
 *   - Si pathname === '/dashboard' exacto → query users.role y redirige al
 *     subdashboard correcto.
 *   - Si profile.active=false → signOut + /login?error=inactive.
 *
 * `requireRole()` en cada subpágina es la segunda capa (defense in depth) —
 * este middleware NO valida rol mínimo para subprefijos (lo hace cada page).
 */

const PROTECTED_PREFIXES = ['/dashboard', '/director', '/oficina', '/comercial', '/admin'];
const AUTH_ONLY_PATHS = ['/login', '/auth/check-email'];
const ALWAYS_PUBLIC_PATHS = ['/auth/callback', '/logout'];

function hasAnyPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, supabase, user } = await updateSession(request);

  const pathname = request.nextUrl.pathname;

  // Rutas siempre públicas (callback magic link, logout) → passthrough.
  if (ALWAYS_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return supabaseResponse;
  }

  const isAuthOnly = AUTH_ONLY_PATHS.some((p) => pathname === p);
  const isProtected = !isAuthOnly && hasAnyPrefix(pathname, PROTECTED_PREFIXES);

  // Ruta protegida sin sesión → /login?next=...
  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Si hay sesión, miramos el profile para gating adicional.
  if (user && (isProtected || isAuthOnly)) {
    const { data: profile } = await supabase
      .from('users')
      .select('role, active')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    // Profile inactivo → signOut + /login?error=inactive.
    if (profile && profile.active === false) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.search = '';
      redirectUrl.searchParams.set('error', 'inactive');
      await supabase.auth.signOut();
      return NextResponse.redirect(redirectUrl);
    }

    // User auth válido sin profile en public.users → sesión huérfana, cerrar.
    if (!profile) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.search = '';
      redirectUrl.searchParams.set('error', 'no_profile');
      await supabase.auth.signOut();
      return NextResponse.redirect(redirectUrl);
    }

    // Ruta auth-only con sesión activa → al dashboard general (que redirigirá por rol).
    if (isAuthOnly) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }

    // /dashboard exacto → subdashboard por rol.
    // Preserva el query string original (ej. ?error=forbidden) para que el
    // subdashboard pueda mostrar el toast tras un redirect de requireRole.
    if (pathname === '/dashboard' && profile.role) {
      const targetByRole: Record<string, string> = {
        admin: '/director/dashboard',
        director_general: '/director/dashboard',
        director_oficina: '/oficina/dashboard',
        comercial: '/comercial/dashboard',
        asistente_captador: '/comercial/dashboard',
      };
      const target = targetByRole[profile.role];
      if (target) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = target;
        // NO borramos search — preserva ?error=* y cualquier param.
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
