import { notFound } from 'next/navigation';

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { ROLE_HIERARCHY } from '@/lib/auth/types';
import { getConversationDetail } from '@/lib/actions/conversations';
import { listLabels } from '@/lib/actions/labels';
import { ConversationDetailView } from '@/components/conversations/conversation-detail';

export const dynamic = 'force-dynamic';

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const convId = /^\d+$/.test(id) ? Number(id) : NaN;
  if (!Number.isFinite(convId)) notFound();

  const eff = await getEffectiveTenant();
  if (!eff) notFound();

  const [detailRes, labelsRes] = await Promise.all([getConversationDetail(convId), listLabels()]);
  if (!detailRes.ok || !detailRes.data) notFound();

  const canBlock = ROLE_HIERARCHY[eff.role] >= ROLE_HIERARCHY.director_oficina;
  const labels = labelsRes.ok ? labelsRes.data : [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <ConversationDetailView detail={detailRes.data} labels={labels} canBlock={canBlock} />
    </div>
  );
}
