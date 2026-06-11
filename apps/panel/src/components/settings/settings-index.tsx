import Link from 'next/link';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/requireRole';

export async function SettingsIndex() {
  const profile = await requireRole('comercial'); // cualquier miembro activo
  const canManage = profile.role === 'admin' || profile.role === 'director_general';

  const cards = [
    { href: '/settings/profile', title: 'Mi perfil', desc: 'Nombre para mostrar y contraseña.', show: true },
    { href: '/settings/members', title: 'Miembros', desc: 'Equipo, roles, oficinas e invitaciones.', show: canManage },
    { href: '/settings/integrations', title: 'Integraciones', desc: 'WhatsApp, GHL, Meta, voz.', show: canManage },
  ].filter((c) => c.show);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Ajustes</h1>
        <p className="text-sm text-muted-foreground">Configuración de tu cuenta y de la inmobiliaria.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="block">
            <Card className="h-full transition-colors hover:border-[var(--color-brand-oliva)]">
              <CardHeader>
                <CardTitle className="text-base">{c.title}</CardTitle>
                <CardDescription>{c.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
