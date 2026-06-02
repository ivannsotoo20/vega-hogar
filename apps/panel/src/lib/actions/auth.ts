'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Cierra la sesión y redirige a /login. Server action equivalente al route
 * POST /logout — la usa el UserMenu del shell (dropdown). El route handler
 * /logout (form POST) se mantiene como alternativa no-JS.
 */
export async function logout(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
