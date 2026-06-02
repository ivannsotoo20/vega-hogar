import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PERMISSION_KEYS } from '@/lib/auth/permissions';
import type { UserRole } from '@/lib/auth/types';
import { PermissionsClient } from './PermissionsClient';

export const metadata = {
  title: 'Matriz de permisos · Vega Hogar Inmobiliaria',
};

export const dynamic = 'force-dynamic';

const ROLES: UserRole[] = [
  'admin',
  'director_general',
  'director_oficina',
  'comercial',
  'asistente_captador',
];

export default async function PermisosPage() {
  const profile = await requireRole('admin');

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('permissions_matrix')
    .select('role, permission_key, granted');

  const initialRows = (data ?? []).map((r) => ({
    role: r.role as UserRole,
    permissionKey: r.permission_key as string,
    granted: r.granted as boolean,
  }));

  return (
    <main className="container mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Matriz de permisos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controla la visibilidad UI de botones, listados y menús por rol.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/director/dashboard">← Volver al dashboard</Link>
          </Button>
          <form action="/logout" method="POST">
            <Button type="submit" variant="ghost" size="sm">
              Cerrar sesión
            </Button>
          </form>
        </div>
      </header>

      <Card className="mb-6 border-l-4 border-l-[var(--color-brand-terracota)]">
        <CardHeader>
          <CardTitle className="text-base">Importante</CardTitle>
          <CardDescription>
            Esta matriz controla solo la <strong>visibilidad UI</strong>. La fuente de
            verdad de seguridad son las RLS policies de la base de datos —
            desactivar un permiso aquí <strong>oculta el affordance</strong> pero NO
            bloquea el acceso a datos. Para revocar acceso real, modifica las
            policies en <code>packages/db/policies/</code>.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permisos UI · {ROLES.length} roles × {PERMISSION_KEYS.length} keys</CardTitle>
          <CardDescription>
            Cambios se guardan al instante. Sesión activa: {profile.email}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionsClient
            initialRows={initialRows}
            roles={ROLES}
            permissionKeys={[...PERMISSION_KEYS]}
          />
        </CardContent>
      </Card>
    </main>
  );
}
