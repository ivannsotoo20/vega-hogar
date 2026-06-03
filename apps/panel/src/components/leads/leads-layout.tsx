/**
 * F5 / S4 — Orquestador server de `/leads`. Hace el fetch inicial (anon + RLS) en
 * paralelo y reparte a los componentes cliente. Calcula los flags de rol que
 * gobiernan los affordances de escritura (coinciden con los gates de las acciones):
 *   · canEdit   = director_oficina+ (editar datos maestros, asignar)
 *   · canGdpr   = director_general+ (exportar / eliminar)
 *   · pausar/etiquetar/notar → cualquier miembro (la RLS acota a sus leads).
 */

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { ROLE_HIERARCHY } from '@/lib/auth/types';
import { getLeadDetail, listLeadsPage } from '@/lib/actions/leads';
import { listLabels } from '@/lib/actions/labels';
import { listMembers } from '@/lib/actions/members';
import type { LeadFilterParams, LeadTabKey } from '@/lib/lead-list-query';

import { LeadDetailSheet } from './lead-detail-sheet';
import { LeadsListFilters } from './leads-list-filters';
import { LeadsListPane } from './leads-list-pane';

const PAGE_SIZE = 100;

export async function LeadsLayout({
  filters,
  activeTab,
  selectedId,
}: {
  filters: LeadFilterParams;
  activeTab: LeadTabKey;
  selectedId: number | null;
}) {
  const eff = await getEffectiveTenant();
  if (!eff) return null;

  const [pageRes, labelsRes, membersRes, detailRes] = await Promise.all([
    listLeadsPage({ filters, cursor: null, limit: PAGE_SIZE }),
    listLabels(),
    listMembers(),
    selectedId != null ? getLeadDetail(selectedId) : Promise.resolve(null),
  ]);

  if (!pageRes.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudieron cargar los leads: {pageRes.error}
      </div>
    );
  }

  const page = pageRes.data!;
  const labels = labelsRes.ok ? labelsRes.data : [];
  const members = membersRes.ok ? membersRes.data : [];
  const detail = detailRes && detailRes.ok ? (detailRes.data ?? null) : null;

  const assigneeMap: Record<number, string> = {};
  for (const m of members) assigneeMap[m.id] = m.fullName ?? m.email;

  const level = ROLE_HIERARCHY[eff.role];
  const canEdit = level >= ROLE_HIERARCHY.director_oficina;
  const canManageGdpr = level >= ROLE_HIERARCHY.director_general; // exportar (acceso)
  const canDelete = level >= ROLE_HIERARCHY.admin; // suprimir (Art. 17) = solo admin

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <aside className="md:sticky md:top-20 md:self-start">
        <LeadsListFilters
          filters={filters}
          labels={labels}
          members={members}
          viewerId={eff.userId}
        />
      </aside>

      <section className="min-w-0">
        <LeadsListPane
          key={JSON.stringify({ filters, activeTab })}
          initialRows={page.rows}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          selectedId={selectedId}
          activeTab={activeTab}
          filters={filters}
          assigneeMap={assigneeMap}
          pageSize={PAGE_SIZE}
        />
      </section>

      <LeadDetailSheet
        detail={detail}
        members={members}
        labels={labels}
        viewerId={eff.userId}
        canEdit={canEdit}
        canManageGdpr={canManageGdpr}
        canDelete={canDelete}
      />
    </div>
  );
}
