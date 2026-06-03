import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { ROLE_HIERARCHY } from '@/lib/auth/types';
import { getLeadDetail } from '@/lib/actions/leads';
import { listLabels } from '@/lib/actions/labels';
import { listMembers } from '@/lib/actions/members';
import { LeadDetail } from '@/components/leads/lead-detail';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = /^\d+$/.test(id) ? Number(id) : NaN;
  if (!Number.isFinite(leadId)) notFound();

  const eff = await getEffectiveTenant();
  if (!eff) notFound();

  const [detailRes, labelsRes, membersRes] = await Promise.all([
    getLeadDetail(leadId),
    listLabels(),
    listMembers(),
  ]);
  if (!detailRes.ok || !detailRes.data) notFound();

  const labels = labelsRes.ok ? labelsRes.data : [];
  const members = membersRes.ok ? membersRes.data : [];
  const level = ROLE_HIERARCHY[eff.role];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/leads">
          <ArrowLeft aria-hidden /> Volver a leads
        </Link>
      </Button>
      <LeadDetail
        detail={detailRes.data}
        members={members}
        labels={labels}
        viewerId={eff.userId}
        canEdit={level >= ROLE_HIERARCHY.director_oficina}
        canManageGdpr={level >= ROLE_HIERARCHY.director_general}
        canDelete={level >= ROLE_HIERARCHY.admin}
      />
    </div>
  );
}
