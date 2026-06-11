import { redirect } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { requireRole } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Resumen de agencia · Vega Hogar Inmobiliaria',
};

export const dynamic = 'force-dynamic';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Conteo anon+RLS (RLS escopa al tenant efectivo). null si la query falla. */
async function countOf(supabase: ServerClient, table: string, activeOnly = false): Promise<number | null> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (activeOnly) q = q.eq('active', true);
  const { count, error } = await q;
  return error ? null : (count ?? 0);
}

export default async function AdminDashboardPage() {
  const profile = await requireRole('admin');
  if (!profile.isAgencyAdmin) redirect('/dashboard?error=forbidden');

  const eff = await getEffectiveTenant();
  const supabase = await createSupabaseServerClient();

  const [leads, conversations, properties, visits, members] = await Promise.all([
    countOf(supabase, 'leads'),
    countOf(supabase, 'conversations'),
    countOf(supabase, 'properties'),
    countOf(supabase, 'visits'),
    countOf(supabase, 'users', true),
  ]);

  const kpis = [
    { label: 'Leads', value: leads, hint: 'compradores y vendedores' },
    { label: 'Conversaciones', value: conversations, hint: 'hilos del agente' },
    { label: 'Inmuebles', value: properties, hint: 'catálogo activo' },
    { label: 'Visitas', value: visits, hint: 'agenda + tasaciones' },
    { label: 'Miembros activos', value: members, hint: 'usuarios del tenant' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Resumen de agencia</h1>
        <p className="text-sm text-muted-foreground">
          Vista de agencia (Fyzon). Hoy opera sobre la inmobiliaria tenant{' '}
          {eff?.tenantId ?? '—'} (Vega Hogar). Dashboard operativo completo en F11.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{k.value ?? '—'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
