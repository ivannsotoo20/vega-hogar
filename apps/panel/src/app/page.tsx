import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

// Lee la cookie de sesión para reenviar a quien ya tenga acceso.
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Si ya hay sesión válida (con profile activo), entrar directo al panel.
  // El middleware enruta /dashboard al subdashboard correcto según el rol.
  const current = await getCurrentUser();
  if (current) {
    redirect('/dashboard');
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex max-w-2xl flex-col items-center gap-8 text-center">
        <div className="inline-flex items-center gap-3 rounded-full border border-brand-oliva/20 bg-brand-blanco/60 px-4 py-1.5 text-sm text-brand-oliva-dark">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-terracota" />
          Panel del equipo
        </div>

        <h1 className="font-serif text-5xl tracking-tight text-brand-oliva-dark md:text-7xl">
          Vega Hogar
          <span className="block text-brand-terracota">Inmobiliaria</span>
        </h1>

        <p className="font-serif text-xl italic text-brand-negro/70 md:text-2xl">
          Tu hogar en Valencia, desde 1998
        </p>

        <p className="max-w-md text-base leading-relaxed text-brand-negro/60">
          Sistema centralizado + agente comercial IA. Panel para el equipo,
          captación automatizada de vendedores, WhatsApp y voz integrados.
        </p>

        <Button asChild size="lg" className="mt-2">
          <Link href="/login">Acceder al panel</Link>
        </Button>

        <footer className="mt-8 text-xs uppercase tracking-widest text-brand-negro/40">
          Proyecto formativo · Fyzon
        </footer>
      </div>
    </main>
  );
}
