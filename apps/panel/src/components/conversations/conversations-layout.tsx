/**
 * F6 / S3 — Orquestador server de `/conversations`. Fetch inicial anon+RLS en
 * paralelo y reparto a los componentes cliente. La RLS escopa la visibilidad por
 * rol (comercial → solo sus leads; gestores → más). Affordances de escritura:
 *   · pausar / handoff / leído / etiquetar / notar → cualquier miembro.
 *   · bloquear → director_oficina+ (canBlock).
 */

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { ROLE_HIERARCHY } from '@/lib/auth/types';
import { getConversationDetail, listConversationsPage } from '@/lib/actions/conversations';
import { listLabels } from '@/lib/actions/labels';
import { listMembers } from '@/lib/actions/members';
import type { ConversationFilterParams, ConvTabKey } from '@/lib/conversation-list-query';

import { ConversationDetailSheet } from './conversation-detail-sheet';
import { ConversationsListFilters } from './conversations-list-filters';
import { ConversationsListPane } from './conversations-list-pane';

const PAGE_SIZE = 100;

export async function ConversationsLayout({
  filters,
  activeTab,
  selectedId,
}: {
  filters: ConversationFilterParams;
  activeTab: ConvTabKey;
  selectedId: number | null;
}) {
  const eff = await getEffectiveTenant();
  if (!eff) return null;

  const [pageRes, labelsRes, membersRes, detailRes] = await Promise.all([
    listConversationsPage({ filters: { ...filters, viewerId: eff.userId }, cursor: null, limit: PAGE_SIZE }),
    listLabels(),
    listMembers(),
    selectedId != null ? getConversationDetail(selectedId) : Promise.resolve(null),
  ]);

  if (!pageRes.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudieron cargar las conversaciones: {pageRes.error}
      </div>
    );
  }

  const page = pageRes.data!;
  const labels = labelsRes.ok ? labelsRes.data : [];
  const members = membersRes.ok ? membersRes.data : [];
  const detail = detailRes && detailRes.ok ? (detailRes.data ?? null) : null;

  const assigneeMap: Record<number, string> = {};
  for (const m of members) assigneeMap[m.id] = m.fullName ?? m.email;

  const canBlock = ROLE_HIERARCHY[eff.role] >= ROLE_HIERARCHY.director_oficina;

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <aside className="md:sticky md:top-20 md:self-start">
        <ConversationsListFilters filters={{ ...filters, viewerId: eff.userId }} labels={labels} members={members} />
      </aside>

      <section className="min-w-0">
        <ConversationsListPane
          key={JSON.stringify({ filters, activeTab })}
          initialRows={page.rows}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          selectedId={selectedId}
          activeTab={activeTab}
          filters={{ ...filters, viewerId: eff.userId }}
          assigneeMap={assigneeMap}
          pageSize={PAGE_SIZE}
        />
      </section>

      <ConversationDetailSheet detail={detail} labels={labels} canBlock={canBlock} />
    </div>
  );
}
