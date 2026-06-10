/**
 * F8 / S4 — Cockpit de captación (Opción A: vista enfocada, NO board propio).
 *
 * Agrega lo que ninguna vista única ofrece hoy para el captador: los leads
 * `intent ∈ {seller, landlord}` por fase del track seller (read-only) + las
 * visitas técnicas de tasación + KPIs + accesos directos a `/pipeline?track=seller`,
 * a la ficha de lead (F5) y al alta de inmueble (F7).
 *
 * REÚSA acciones existentes (listLeadsPage + listVisitsPage) — NO añade acciones
 * nuevas y NO duplica el kanban arrastrable de F6 (sigue siendo `/pipeline`).
 * La RLS escopa la visibilidad; el gate de ruta (captacion.view) lo aplica la page.
 */

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { ROLE_HIERARCHY } from '@/lib/auth/types';
import { listLeadsPage } from '@/lib/actions/leads';
import { listVisitsPage } from '@/lib/actions/visits';

import { CaptacionKpis } from './captacion-kpis';
import { CaptacionPhaseBoard } from './captacion-phase-board';
import { CaptacionTasationVisits } from './captacion-tasation-visits';

export async function CaptacionCockpit() {
  const eff = await getEffectiveTenant();
  if (!eff) return null;

  // El alta de inmueble exige director_oficina+ (createProperty). El asistente_captador
  // ve la captación pero NO puede crear inmuebles → no le ofrecemos el botón (sería un
  // callejón sin salida en /properties, donde el dialog tampoco se renderiza para él).
  const canCreateProperty = ROLE_HIERARCHY[eff.role] >= ROLE_HIERARCHY.director_oficina;

  const [leadsRes, visitsRes] = await Promise.all([
    listLeadsPage({ filters: { intents: ['seller', 'landlord'] }, cursor: null, limit: 200 }),
    listVisitsPage({
      filters: { visitType: 'tasation', statuses: ['scheduled', 'done'] },
      cursor: null,
      limit: 100,
    }),
  ]);

  const leads = leadsRes.ok && leadsRes.data ? leadsRes.data.rows : [];
  const tasations = visitsRes.ok && visitsRes.data ? visitsRes.data.rows : [];

  return (
    <div className="flex flex-col gap-6">
      <CaptacionKpis leads={leads} tasations={tasations} />
      <CaptacionPhaseBoard leads={leads} canCreateProperty={canCreateProperty} />
      <CaptacionTasationVisits visits={tasations} />
    </div>
  );
}
