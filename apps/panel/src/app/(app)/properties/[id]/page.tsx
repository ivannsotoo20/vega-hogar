import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { ROLE_HIERARCHY, type UserRole } from '@/lib/auth/types';
import { getPropertyDetail } from '@/lib/actions/properties';
import { listMembers } from '@/lib/actions/members';
import { listOffices } from '@/lib/actions/offices';
import { PropertyDetail } from '@/components/properties/property-detail';

export const dynamic = 'force-dynamic';

const OWNER_ROLES: readonly UserRole[] = [
  'admin',
  'director_general',
  'director_oficina',
  'asistente_captador',
];

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const propertyId = /^\d+$/.test(id) ? Number(id) : NaN;
  if (!Number.isFinite(propertyId)) notFound();

  const eff = await getEffectiveTenant();
  if (!eff) notFound();

  const [detailRes, membersRes, officesRes] = await Promise.all([
    getPropertyDetail(propertyId),
    listMembers(),
    listOffices(),
  ]);
  if (!detailRes.ok || !detailRes.data) notFound();

  const members = membersRes.ok ? membersRes.data : [];
  const offices = officesRes.ok ? officesRes.data : [];
  const level = ROLE_HIERARCHY[eff.role];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/properties">
          <ArrowLeft aria-hidden /> Volver a inmuebles
        </Link>
      </Button>
      <PropertyDetail
        detail={detailRes.data}
        members={members}
        offices={offices}
        viewerId={eff.userId}
        canEdit={level >= ROLE_HIERARCHY.director_oficina}
        canDelete={eff.role === 'admin'}
        canViewOwners={OWNER_ROLES.includes(eff.role)}
      />
    </div>
  );
}
