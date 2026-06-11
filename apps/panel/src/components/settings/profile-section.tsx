import { redirect } from 'next/navigation';

import { ProfileClient } from '@/components/settings/profile-client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  director_general: 'Director general',
  director_oficina: 'Director de oficina',
  comercial: 'Comercial',
  asistente_captador: 'Asistente de captación',
};

export async function ProfileSection() {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  const { authUser, profile } = current;

  const displayName =
    (authUser.user_metadata?.full_name as string | undefined)?.trim() || profile.fullName || '';

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">
          Tus datos de cuenta y seguridad.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la organización</CardTitle>
          <CardDescription>Gestionados por un administrador (solo lectura aquí).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{profile.email}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Nombre</span>
            <span className="font-medium">{profile.fullName ?? '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Rol</span>
            <Badge variant="outline">{ROLE_LABELS[profile.role] ?? profile.role}</Badge>
          </div>
          {profile.isAgencyAdmin ? (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Agencia</span>
              <Badge variant="secondary">Agency-admin</Badge>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cuenta</CardTitle>
          <CardDescription>Nombre para mostrar y contraseña.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileClient initialFullName={displayName} />
        </CardContent>
      </Card>
    </div>
  );
}
