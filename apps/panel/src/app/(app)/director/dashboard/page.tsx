import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/requireRole';

export const metadata = {
  title: 'Dashboard Dirección · Vega Hogar Inmobiliaria',
};

export const dynamic = 'force-dynamic';

export default async function DirectorDashboardPage() {
  const profile = await requireRole(['admin', 'director_general']);

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl">Dashboard Dirección</h1>
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
            <CardTitle>KPIs consolidados</CardTitle>
            <CardDescription>Tenant Vega Hogar — toda la operación</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Datos reales llegan en Fase 3 (panel inmuebles + leads).
          </CardContent>
        </Card>

        {profile.role === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle>Administración</CardTitle>
              <CardDescription>Sólo visible para rol admin</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="default" size="sm">
                <Link href="/admin/permisos">Matriz de permisos</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
