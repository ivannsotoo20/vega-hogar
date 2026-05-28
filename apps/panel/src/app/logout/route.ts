import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Logout POST-only. POST (no GET) para evitar logout por prefetch o por
 * crawler. Llamar con un <form method="POST" action="/logout">.
 *
 * Status 303 See Other es crítico: tras POST, fuerza al browser a hacer
 * GET en el redirect. Con el default 307 (preserve method) el browser
 * haría POST /login → 405 Method Not Allowed.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
