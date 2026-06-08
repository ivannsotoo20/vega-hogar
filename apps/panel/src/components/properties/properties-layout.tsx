/**
 * F7 / S3 — Orquestador server de `/properties`. Fetch inicial (anon + RLS) en
 * paralelo y reparto a los componentes cliente. Flags de rol (coinciden con los
 * gates de las acciones + la RLS):
 *   · canEdit        = director_oficina+ (crear/editar/archivar/fotos)
 *   · canDelete      = admin (soft-delete; + guard BD)
 *   · canViewOwners  = admin/dg/director_oficina/asistente_captador (set RLS; comercial NO)
 */

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { ROLE_HIERARCHY, type UserRole } from '@/lib/auth/types';
import { getPropertyDetail, listPropertiesPage } from '@/lib/actions/properties';
import { listMembers } from '@/lib/actions/members';
import { listOffices } from '@/lib/actions/offices';
import type { PropertyFilterParams, PropertyTabKey } from '@/lib/property-list-query';

import { AddPropertyDialog } from './add-property-dialog';
import { PropertiesListFilters } from './properties-list-filters';
import { PropertiesListPane } from './properties-list-pane';
import { PropertyDetailSheet } from './property-detail-sheet';

const PAGE_SIZE = 100;
const OWNER_ROLES: readonly UserRole[] = [
  'admin',
  'director_general',
  'director_oficina',
  'asistente_captador',
];

export async function PropertiesLayout({
  filters,
  activeTab,
  selectedId,
}: {
  filters: PropertyFilterParams;
  activeTab: PropertyTabKey;
  selectedId: number | null;
}) {
  const eff = await getEffectiveTenant();
  if (!eff) return null;

  const [pageRes, membersRes, officesRes, detailRes] = await Promise.all([
    listPropertiesPage({ filters, cursor: null, limit: PAGE_SIZE }),
    listMembers(),
    listOffices(),
    selectedId != null ? getPropertyDetail(selectedId) : Promise.resolve(null),
  ]);

  if (!pageRes.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudieron cargar los inmuebles: {pageRes.error}
      </div>
    );
  }

  const page = pageRes.data!;
  const members = membersRes.ok ? membersRes.data : [];
  const offices = officesRes.ok ? officesRes.data : [];
  const detail = detailRes && detailRes.ok ? (detailRes.data ?? null) : null;

  const assigneeMap: Record<number, string> = {};
  for (const m of members) assigneeMap[m.id] = m.fullName ?? m.email;

  const level = ROLE_HIERARCHY[eff.role];
  const canEdit = level >= ROLE_HIERARCHY.director_oficina;
  const canDelete = eff.role === 'admin';
  const canViewOwners = OWNER_ROLES.includes(eff.role);

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <aside className="md:sticky md:top-20 md:self-start">
        <PropertiesListFilters filters={filters} members={members} viewerId={eff.userId} />
      </aside>

      <section className="min-w-0">
        {canEdit && offices.length > 0 && (
          <div className="flex justify-end pb-3">
            <AddPropertyDialog offices={offices} />
          </div>
        )}
        <PropertiesListPane
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

      <PropertyDetailSheet
        detail={detail}
        members={members}
        offices={offices}
        viewerId={eff.userId}
        canEdit={canEdit}
        canDelete={canDelete}
        canViewOwners={canViewOwners}
      />
    </div>
  );
}
