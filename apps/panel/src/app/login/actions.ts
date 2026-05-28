'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Envía magic link al email. `shouldCreateUser: false` — no se crean cuentas
 * nuevas vía magic link en Vega Hogar (creación va por seed/admin).
 *
 * Anti-enumeración: la action siempre redirige a /auth/check-email,
 * incluso si el email no existe o el envío falla, para no revelar qué
 * cuentas existen.
 */
export async function requestMagicLinkAction(formData: FormData): Promise<void> {
  const rawEmail = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
    redirect('/login?error=invalid_email');
  }

  const supabase = await createSupabaseServerClient();
  const origin = await getOrigin();

  // Fire-and-forget: no esperamos el resultado para no revelar
  // si el email existe (anti-enumeración timing-based).
  await supabase.auth.signInWithOtp({
    email: rawEmail,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  // Independientemente del resultado → check-email page.
  redirect(`/auth/check-email?email=${encodeURIComponent(rawEmail)}`);
}
