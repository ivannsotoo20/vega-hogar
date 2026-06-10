/**
 * Helpers puros para clasificar y filtrar la agenda de visitas (tabla `visits`).
 * Módulo NUEVO de F8 (no existe en SETTER); sigue el patrón de
 * `property-list-query.ts` / `lead-list-query.ts` (tipos de fila + filtros + tabs
 * + parsers, sin I/O).
 *
 * La visibilidad por rol la aplica RLS (Fase 1, `05-visits.sql`), no este código:
 * comercial ve solo sus visitas, director_oficina las de su oficina, admin/dg/
 * asistente_captador todas. Tabs por estado/tipo (NO por reloj): las fechas del
 * seed pueden quedar en el pasado, así que la navegación va por `status`.
 */

export type VisitStatus = 'scheduled' | 'done' | 'noshow' | 'cancelled' | 'rescheduled';

/** Tipo de visita: comercial normal vs visita técnica de tasación (humana). */
export type VisitType = 'visit' | 'tasation';

export type VisitTabKey = 'scheduled' | 'done' | 'tasations' | 'all';

/** Lead desanidado (2ª query) para la fila/ficha de visita. */
export interface VisitLeadRef {
  id: number;
  full_name: string | null;
  phone: string | null;
  intent: string;
}

/** Inmueble desanidado (opcional: una visita puede no tener inmueble aún). */
export interface VisitPropertyRef {
  id: number;
  title: string;
  neighborhood: string;
}

/** Comercial asignado, desanidado. */
export interface VisitComercialRef {
  id: number;
  full_name: string | null;
  email: string;
}

export interface VisitListRow {
  id: number;
  lead_id: number;
  property_id: number | null;
  comercial_user_id: number;
  scheduled_for: string;
  status: VisitStatus;
  outcome_notes: string | null;
  lead_feedback: string | null;
  is_tasation: boolean;
  /** Enlace a la cita de calendario (GHL); null mientras el motor no está cableado. */
  calendar_appointment_id: number | null;
  created_at: string;
  updated_at: string;
  lead: VisitLeadRef | null;
  property: VisitPropertyRef | null;
  comercial: VisitComercialRef | null;
}

export interface VisitFilterParams {
  q?: string;
  statuses?: string[]; // VisitStatus
  visitType?: 'any' | 'visit' | 'tasation';
  comercial?: string; // 'any' | 'mine' | <userId>  (comercial_user_id es NOT NULL → sin 'unassigned')
  viewerId?: number | null;
  scheduledFrom?: string | null; // yyyy-mm-dd inclusive
  scheduledTo?: string | null; // yyyy-mm-dd inclusive
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function visitTypeOf(row: VisitListRow): VisitType {
  return row.is_tasation ? 'tasation' : 'visit';
}

/** ¿`scheduled_for` (timestamptz ISO) cae dentro de [from, to] (fechas yyyy-mm-dd)? */
function inDateRange(
  scheduledFor: string,
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (!from && !to) return true;
  const day = (scheduledFor ?? '').slice(0, 10); // yyyy-mm-dd (lexicográfico)
  if (day.length < 10) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Tabs (filtros rápidos independientes, por estado/tipo)
// ---------------------------------------------------------------------------

const ALL_TABS: readonly VisitTabKey[] = ['scheduled', 'done', 'tasations', 'all'];

export function matchesVisitTab(row: VisitListRow, tab: VisitTabKey): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'scheduled':
      return row.status === 'scheduled';
    case 'done':
      return row.status === 'done';
    case 'tasations':
      return row.is_tasation === true;
  }
}

export type VisitTabCounts = Record<VisitTabKey, number>;

export function visitTabCounts(rows: VisitListRow[]): VisitTabCounts {
  const counts: VisitTabCounts = { scheduled: 0, done: 0, tasations: 0, all: rows.length };
  for (const r of rows) {
    if (matchesVisitTab(r, 'scheduled')) counts.scheduled += 1;
    if (matchesVisitTab(r, 'done')) counts.done += 1;
    if (matchesVisitTab(r, 'tasations')) counts.tasations += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export function applyVisitFilters(
  rows: VisitListRow[],
  filters: VisitFilterParams,
): VisitListRow[] {
  const q = (filters.q ?? '').trim().toLowerCase();
  const statuses = filters.statuses ?? [];
  const visitType = filters.visitType ?? 'any';
  const comercial = filters.comercial ?? 'any';
  const viewerId = filters.viewerId ?? null;
  const from = filters.scheduledFrom ?? null;
  const to = filters.scheduledTo ?? null;

  return rows.filter((row) => {
    if (q.length > 0) {
      const haystack = [
        row.lead?.full_name,
        row.lead?.phone,
        row.property?.title,
        row.property?.neighborhood,
        row.comercial?.full_name,
      ]
        .filter((v): v is string => v != null && v.length > 0)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (statuses.length > 0 && !statuses.includes(row.status)) return false;

    if (visitType !== 'any') {
      if (visitType === 'tasation' && !row.is_tasation) return false;
      if (visitType === 'visit' && row.is_tasation) return false;
    }

    if (!inDateRange(row.scheduled_for, from, to)) return false;

    if (comercial !== 'any') {
      if (comercial === 'mine') {
        if (viewerId == null || row.comercial_user_id !== viewerId) return false;
      } else {
        const id = Number(comercial);
        if (!Number.isFinite(id) || row.comercial_user_id !== id) return false;
      }
    }

    return true;
  });
}

export function rowsForVisitTab(
  rows: VisitListRow[],
  tab: VisitTabKey,
  filters: VisitFilterParams,
): VisitListRow[] {
  const filtered = applyVisitFilters(rows, filters);
  if (tab === 'all') return filtered;
  return filtered.filter((r) => matchesVisitTab(r, tab));
}

// ---------------------------------------------------------------------------
// URL param parsers
// ---------------------------------------------------------------------------

export function parseVisitTab(value: string | null | undefined): VisitTabKey {
  if (value && (ALL_TABS as readonly string[]).includes(value)) return value as VisitTabKey;
  return 'scheduled';
}

export function parseVisitType(value: string | null | undefined): 'any' | 'visit' | 'tasation' {
  if (value === 'visit' || value === 'tasation') return value;
  return 'any';
}

export function parseCsvStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function countActiveVisitFilters(filters: VisitFilterParams): number {
  let n = 0;
  if ((filters.q ?? '').trim().length > 0) n += 1;
  if ((filters.statuses ?? []).length > 0) n += 1;
  if ((filters.visitType ?? 'any') !== 'any') n += 1;
  if ((filters.comercial ?? 'any') !== 'any') n += 1;
  if (filters.scheduledFrom != null || filters.scheduledTo != null) n += 1;
  return n;
}
