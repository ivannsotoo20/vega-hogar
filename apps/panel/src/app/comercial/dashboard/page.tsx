import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/requireRole';

export const metadata = {
  title: 'Dashboard · Vega Hogar Inmobiliaria',
};

export const dynamic = 'force-dynamic';

export default async function ComercialDashboardPage() {
  const profile = await requireRole(['comercial', 'asistente_captador']);

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl">Mi panel</h1>
          <p className="text-sm text-muted-foreground">
            {profile.fullName ?? profile.email} · {profile.role}
          </p>
        </div>
        <form action="/logout" method="POST">
          <Button type="submit" variant="outline" size="sm">
            Cerrar sesión
          </Button>
        </form>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tus leads</CardTitle>
            <CardDescription>
              {profile.role === 'asistente_captador'
                ? 'Leads de captación (cross-oficina)'
                : 'Leads asignados a ti'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Datos llegan en Fase 4 (panel leads + visitas).
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visitas próximas</CardTitle>
            <CardDescription>Agendadas en los próximos 7 días</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Datos llegan en Fase 4.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
