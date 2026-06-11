import Link from 'next/link';

import { AcceptInviteForm } from './AcceptInviteForm';

export const metadata = {
  title: 'Aceptar invitación · Vega Hogar Inmobiliaria',
};

export const dynamic = 'force-dynamic';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = (raw ?? '').trim();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-2xl text-foreground">Vega Hogar Inmobiliaria</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aceptar invitación al equipo</p>
        </div>

        {token.length < 32 ? (
          <div className="rounded-lg border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Este enlace de invitación no es válido o está incompleto. Pide a tu administrador
              que te reenvíe la invitación.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm text-[var(--color-brand-oliva)] hover:underline">
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-6">
            <AcceptInviteForm token={token} />
          </div>
        )}
      </div>
    </main>
  );
}
