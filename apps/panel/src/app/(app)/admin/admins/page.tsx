import { redirect } from 'next/navigation';

import { AdminsClient, type AdminRow } from '@/components/admin/admins-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { requireRole } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Admins de agencia · Vega Hogar Inmobiliaria',
};

export const dynamic = 'force-dynamic';

export default async function AdminAdminsPage() {
  const profile = await requireRole('admin');
  if (!profile.isAgencyAdmin) redirect('/dashboard?error=forbidden');

  const eff = await getEffectiveTenant();
  const supabase = await createSupabaseServerClient();

  // Miembros del tenant (RLS users_select tenant-wide) → marcamos quién es agency-admin.
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role, is_agency_admin, active')
    .eq('active', true)
    .order('is_agency_admin', { ascending: false })
    .order('full_name', { ascending: true });

  const rows: AdminRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    fullName: (r.full_name as string | null) ?? null,
    email: String(r.email),
    role: String(r.role),
    isAgencyAdmin: r.is_agency_admin === true,
  }));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Admins de agencia</h1>
        <p className="text-sm text-muted-foreground">
          Marca qué miembros son administradores de agencia (Fyzon). Un agency-admin ve el
          grupo «Agencia» y el Cerebro. No puedes quitarte el flag a ti mismo ni dejar la
          agencia sin admins.
        </p>
      </header>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudieron cargar los miembros: {error.message}
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Miembros · {rows.length}</CardTitle>
            <CardDescription>El cambio se aplica al instante.</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminsClient rows={rows} viewerId={eff?.userId ?? -1} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
