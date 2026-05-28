import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Endpoint al que aterriza el magic link. Canjea `code` por sesión y redirige
 * al dashboard (el middleware hace el redirect por rol).
 *
 * Edge cases:
 *   - Sin `code` → /login?error=missing_code.
 *   - exchangeCodeForSession falla → /login?error=invalid_code.
 *   - `?next=/foo` se respeta solo si empieza por `/` (anti open-redirect).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next');

  const target = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?error=invalid_code', url));
  }

  // Crítico para que el middleware vea la nueva sesión en el redirect.
  revalidatePath('/', 'layout');
  return NextResponse.redirect(new URL(target, url));
}
