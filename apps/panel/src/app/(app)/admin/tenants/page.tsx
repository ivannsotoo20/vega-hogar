import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Inmobiliarias · Vega Hogar Inmobiliaria',
};

export const dynamic = 'force-dynamic';

interface TenantRow {
  id: number;
  slug: string;
  name: string;
  is_active: boolean;
  onboarded_at: string | null;
  created_at: string;
}

export default async function AdminTenantsPage() {
  const profile = await requireRole('admin');
  if (!profile.isAgencyAdmin) redirect('/dashboard?error=forbidden');

  const supabase = await createSupabaseServerClient();
  // RLS `tenants_select` = solo el propio tenant → hoy únicamente Vega Hogar.
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, is_active, onboarded_at, created_at')
    .order('id', { ascending: true });

  const tenants = (data ?? []) as TenantRow[];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Inmobiliarias</h1>
          <p className="text-sm text-muted-foreground">
            Inmobiliarias-tenant gestionadas por la agencia. Hoy el panel opera sobre una
            única inmobiliaria (Vega Hogar).
          </p>
        </div>
        <Button disabled title="El alta multi-inmobiliaria + cambio de scope llegan en una fase posterior.">
          + Nueva inmobiliaria
        </Button>
      </header>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudieron cargar las inmobiliarias: {error.message}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tenants.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  {t.is_active ? (
                    <Badge variant="secondary">Activa</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Inactiva</Badge>
                  )}
                </div>
                <CardDescription className="font-mono text-xs">
                  tenant {t.id} · {t.slug}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {t.onboarded_at
                  ? `Onboarding: ${new Date(t.onboarded_at).toLocaleDateString('es-ES')}`
                  : 'Sin fecha de onboarding'}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-l-4 border-l-[var(--color-brand-terracota)]">
        <CardHeader>
          <CardTitle className="text-base">Multi-inmobiliaria (showcase)</CardTitle>
          <CardDescription>
            El alta de nuevas inmobiliarias, el cambio de scope (impersonación) y las RLS
            cross-tenant se habilitarán cuando exista una segunda inmobiliaria real. Hoy la
            RLS escopa toda lectura al tenant propio.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
