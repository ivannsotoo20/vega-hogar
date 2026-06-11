import { MembersClient, type MemberRow } from '@/components/settings/members-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { requireRole } from '@/lib/auth/requireRole';
import { listInvites } from '@/lib/actions/invites';
import { listOffices } from '@/lib/actions/offices';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/auth/types';

export async function MembersSection() {
  const profile = await requireRole(['admin', 'director_general']);
  const eff = await getEffectiveTenant();
  const supabase = await createSupabaseServerClient();

  const [usersRes, uoaRes, officesRes, invitesRes] = await Promise.all([
    supabase.from('users').select('id, full_name, email, role, active').order('full_name', { ascending: true }),
    supabase.from('user_office_assignments').select('user_id, office_id'),
    listOffices(),
    listInvites(),
  ]);

  const officeByUser = new Map<number, number[]>();
  for (const r of (uoaRes.data ?? []) as Array<Record<string, unknown>>) {
    const uid = Number(r.user_id);
    const arr = officeByUser.get(uid) ?? [];
    arr.push(Number(r.office_id));
    officeByUser.set(uid, arr);
  }

  const members: MemberRow[] = ((usersRes.data ?? []) as Array<Record<string, unknown>>).map((u) => ({
    id: Number(u.id),
    fullName: (u.full_name as string | null) ?? null,
    email: String(u.email),
    role: String(u.role) as UserRole,
    active: u.active === true,
    officeIds: officeByUser.get(Number(u.id)) ?? [],
  }));

  const offices = officesRes.ok ? officesRes.data : [];
  const invites = invitesRes.ok ? (invitesRes.data ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Miembros</h1>
        <p className="text-sm text-muted-foreground">
          Equipo de la inmobiliaria: roles, oficinas, activación e invitaciones.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipo · {members.length}</CardTitle>
          <CardDescription>Los cambios se aplican al instante. Sesión: {profile.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <MembersClient
            members={members}
            offices={offices}
            invites={invites}
            viewerId={eff?.userId ?? -1}
            viewerRole={profile.role}
          />
        </CardContent>
      </Card>
    </div>
  );
}
