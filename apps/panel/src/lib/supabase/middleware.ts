import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

export interface UpdateSessionResult {
  /** Respuesta con cookies refrescadas. Devolver si no hay redirect. */
  supabaseResponse: NextResponse;
  /** Cliente Supabase scoped a esta request — usable para queries adicionales. */
  supabase: SupabaseClient;
  /** Usuario auth actual o null si no hay sesión. */
  user: User | null;
}

/**
 * Refresca la cookie de sesión Supabase en una request del middleware raíz.
 * Devuelve la respuesta lista para passthrough, el supabase client scoped, y
 * el user actual (o null).
 *
 * Si el middleware externo decide hacer un redirect, debe crear una nueva
 * `NextResponse.redirect(url)` y copiar manualmente las cookies del
 * `supabaseResponse` devuelto aquí.
 *
 * IMPORTANTE: Edge runtime — no leer datos sensibles ni hacer queries pesadas.
 * Solo refresh de cookie + getUser() + opcionalmente lectura ligera de `users`.
 */
export async function updateSession(request: NextRequest): Promise<UpdateSessionResult> {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() dispara el refresh de la cookie cuando hace falta.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, supabase, user };
}
