import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Dashboard Oficina · Vega Hogar Inmobiliaria',
};

export const dynamic = 'force-dynamic';

export default async function OficinaDashboardPage() {
  const profile = await requireRole('director_oficina');

  const supabase = await createSupabaseServerClient();
  const { data: assignments } = await supabase
    .from('user_office_assignments')
    .select('office_id')
    .eq('user_id', profile.id);

  const officeIds = (assignments ?? []).map((a) => a.office_id);
  const { data: officesData } = officeIds.length > 0
    ? await supabase
        .from('offices')
        .select('id, name, address')
        .in('id', officeIds)
    : { data: [] };

  const offices = officesData ?? [];

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl">Dashboard Oficina</h1>
          <p className="text-sm text-muted-foreground">
            {profile.fullName ?? profile.email} · director_oficina
          </p>
        </div>
        <form action="/logout" method="POST">
          <Button type="submit" variant="outline" size="sm">
            Cerrar sesión
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Tus oficinas</CardTitle>
          <CardDescription>
            {offices.length === 0
              ? 'Sin asignaciones — habla con un administrador.'
              : `${offices.length} oficina(s) asignada(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {offices.map((o) => (
            <div key={o.id} className="flex flex-col">
              <span className="font-medium">{o.name}</span>
              <span className="text-muted-foreground">{o.address}</span>
            </div>
          ))}
          <p className="mt-4 text-xs text-muted-foreground">
            KPIs de oficina llegan en Fase 3.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
