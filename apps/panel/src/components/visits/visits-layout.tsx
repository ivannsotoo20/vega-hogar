/**
 * F8 / S2 — Orquestador server de `/visits`. Fetch inicial (anon + RLS) en
 * paralelo y reparto a los componentes cliente. Flags de rol (coinciden con los
 * gates de las acciones + la matriz):
 *   · canCreate      = todos (visits.create); el comercial se autoasigna en el alta.
 *   · canReassign    = director_oficina+ (visits.reassign); también habilita asignar
 *                      a otro comercial al crear (canAssignOthers).
 *   · isCaptador     = asistente_captador (puede asignar comercial al crear tasaciones).
 * La RLS de `visits` ya escopa la visibilidad por rol → el panel no la replica.
 */

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { ROLE_HIERARCHY } from '@/lib/auth/types';
import { getVisitDetail, listVisitsPage } from '@/lib/actions/visits';
import { listMembers } from '@/lib/actions/members';
import { listLeadsPage } from '@/lib/actions/leads';
import { listPropertiesPage } from '@/lib/actions/properties';
import type { VisitFilterParams, VisitTabKey } from '@/lib/visit-list-query';

import { AddVisitDialog, type SelectOption } from './add-visit-dialog';
import { VisitsListFilters } from './visits-list-filters';
import { VisitsListPane } from './visits-list-pane';
import { VisitDetailSheet } from './visit-detail-sheet';

const PAGE_SIZE = 100;
const OPTIONS_LIMIT = 200;

export async function VisitsLayout({
  filters,
  activeTab,
  selectedId,
}: {
  filters: VisitFilterParams;
  activeTab: VisitTabKey;
  selectedId: number | null;
}) {
  const eff = await getEffectiveTenant();
  if (!eff) return null;

  const [pageRes, membersRes, leadsRes, propsRes, detailRes] = await Promise.all([
    listVisitsPage({ filters, cursor: null, limit: PAGE_SIZE }),
    listMembers(),
    listLeadsPage({ filters: {}, cursor: null, limit: OPTIONS_LIMIT }),
    listPropertiesPage({ filters: {}, cursor: null, limit: OPTIONS_LIMIT }),
    selectedId != null ? getVisitDetail(selectedId) : Promise.resolve(null),
  ]);

  if (!pageRes.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudieron cargar las visitas: {pageRes.error}
      </div>
    );
  }

  const page = pageRes.data!;
  const members = membersRes.ok ? membersRes.data : [];
  const detail = detailRes && detailRes.ok ? (detailRes.data ?? null) : null;

  const leadOptions: SelectOption[] =
    leadsRes.ok && leadsRes.data
      ? leadsRes.data.rows.map((l) => ({
          id: l.id,
          label: l.full_name ?? l.phone ?? `Lead #${l.id}`,
        }))
      : [];
  const propertyOptions: SelectOption[] =
    propsRes.ok && propsRes.data
      ? propsRes.data.rows.map((p) => ({ id: p.id, label: p.title }))
      : [];

  const level = ROLE_HIERARCHY[eff.role];
  const canReassign = level >= ROLE_HIERARCHY.director_oficina;
  const isCaptador = eff.role === 'asistente_captador';

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <aside className="md:sticky md:top-20 md:self-start">
        <VisitsListFilters filters={filters} members={members} viewerId={eff.userId} />
      </aside>

      <section className="min-w-0">
        <div className="flex justify-end pb-3">
          <AddVisitDialog
            leads={leadOptions}
            properties={propertyOptions}
            members={members}
            viewerId={eff.userId}
            canAssignOthers={canReassign}
            isCaptador={isCaptador}
          />
        </div>
        <VisitsListPane
          key={JSON.stringify({ filters, activeTab })}
          initialRows={page.rows}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          selectedId={selectedId}
          activeTab={activeTab}
          filters={filters}
          pageSize={PAGE_SIZE}
        />
      </section>

      <VisitDetailSheet
        detail={detail}
        members={members}
        viewerId={eff.userId}
        canReassign={canReassign}
      />
    </div>
  );
}
