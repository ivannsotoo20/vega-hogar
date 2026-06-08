/**
 * Helpers puros para clasificar y filtrar el catálogo de inmuebles (tabla
 * `properties`). Módulo NUEVO de F7 (no existe en SETTER); sigue el patrón de
 * `lead-list-query.ts` (tipos de fila + filtros + tabs + parsers, sin I/O).
 *
 * La visibilidad por rol la aplica RLS (Fase 1), no este código. Tabs por
 * tipo/estado como filtros rápidos independientes (no clasificación excluyente).
 */

export type PropertyType = 'sale' | 'rent';

export type PropertyStatus = 'available' | 'reserved' | 'sold' | 'rented' | 'inactive';

export type PropertyTabKey = 'all' | 'sale' | 'rent' | 'available' | 'reserved';

export interface PropertyListRow {
  id: number;
  office_id: number;
  type: PropertyType;
  status: PropertyStatus;
  title: string;
  description: string | null;
  price_eur: number | null;
  monthly_rent_eur: number | null;
  m2_built: number;
  m2_useful: number | null;
  rooms: number;
  bathrooms: number;
  year_built: number | null;
  neighborhood: string;
  address_short: string | null;
  features: Record<string, unknown>;
  assigned_to_user_id: number | null;
  created_at: string;
  updated_at: string;
  /** Foto principal (menor sort_order). Solo se rellena en el listado. */
  thumbnail_url: string | null;
}

export interface PropertyPhotoRow {
  id: number;
  url: string;
  caption: string | null;
  sort_order: number;
}

export interface PropertyOwnerRow {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

/** Lead desanidado para el cruce "leads interesados" en la ficha del inmueble. */
export interface PropertyInterestLead {
  id: number;
  full_name: string | null;
  phone: string | null;
  intent: string;
  status: string;
  assigned_to_user_id: number | null;
}

export interface PropertyInterestRow {
  id: number;
  lead_id: number;
  status: string;
  notes: string | null;
  lead: PropertyInterestLead | null;
}

export interface PropertyFilterParams {
  q?: string;
  types?: string[]; // sale | rent
  statuses?: string[]; // PropertyStatus
  neighborhoods?: string[];
  assignee?: string; // 'any' | 'mine' | 'unassigned' | <userId>
  viewerId?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  roomsMin?: number | null;
  m2Min?: number | null;
  features?: string[]; // claves de `features` requeridas (todas)
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/** Precio relevante según el tipo (venta → price_eur; alquiler → renta mensual). */
export function priceFor(row: PropertyListRow): number | null {
  return row.type === 'rent' ? row.monthly_rent_eur : row.price_eur;
}

/** Claves de `features` con valor verdadero. */
export function getActiveFeatures(features: Record<string, unknown> | null | undefined): string[] {
  if (!features || typeof features !== 'object') return [];
  return Object.entries(features)
    .filter(([, v]) => v === true || v === 'true' || v === 1)
    .map(([k]) => k);
}

function priceInRange(
  row: PropertyListRow,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (min == null && max == null) return true;
  // Comparamos contra cualquiera de las dos columnas de precio que tenga la fila
  // (un inmueble de venta usa price_eur; uno de alquiler, monthly_rent_eur).
  const candidates = [row.price_eur, row.monthly_rent_eur].filter(
    (v): v is number => v != null,
  );
  if (candidates.length === 0) return false;
  return candidates.some((value) => {
    if (min != null && value < min) return false;
    if (max != null && value > max) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Tabs (filtros rápidos independientes)
// ---------------------------------------------------------------------------

const ALL_TABS: readonly PropertyTabKey[] = ['all', 'sale', 'rent', 'available', 'reserved'];

export function matchesPropertyTab(row: PropertyListRow, tab: PropertyTabKey): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'sale':
      return row.type === 'sale';
    case 'rent':
      return row.type === 'rent';
    case 'available':
      return row.status === 'available';
    case 'reserved':
      return row.status === 'reserved';
  }
}

export type PropertyTabCounts = Record<PropertyTabKey, number>;

export function propertyTabCounts(rows: PropertyListRow[]): PropertyTabCounts {
  const counts: PropertyTabCounts = { all: rows.length, sale: 0, rent: 0, available: 0, reserved: 0 };
  for (const r of rows) {
    if (matchesPropertyTab(r, 'sale')) counts.sale += 1;
    if (matchesPropertyTab(r, 'rent')) counts.rent += 1;
    if (matchesPropertyTab(r, 'available')) counts.available += 1;
    if (matchesPropertyTab(r, 'reserved')) counts.reserved += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export function applyPropertyFilters(
  rows: PropertyListRow[],
  filters: PropertyFilterParams,
): PropertyListRow[] {
  const q = (filters.q ?? '').trim().toLowerCase();
  const types = filters.types ?? [];
  const statuses = filters.statuses ?? [];
  const neighborhoods = filters.neighborhoods ?? [];
  const assignee = filters.assignee ?? 'any';
  const viewerId = filters.viewerId ?? null;
  const priceMin = filters.priceMin ?? null;
  const priceMax = filters.priceMax ?? null;
  const roomsMin = filters.roomsMin ?? null;
  const m2Min = filters.m2Min ?? null;
  const features = filters.features ?? [];

  return rows.filter((row) => {
    if (q.length > 0) {
      const haystack = [row.title, row.neighborhood, row.address_short]
        .filter((v): v is string => v != null && v.length > 0)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (types.length > 0 && !types.includes(row.type)) return false;
    if (statuses.length > 0 && !statuses.includes(row.status)) return false;
    if (neighborhoods.length > 0 && !neighborhoods.includes(row.neighborhood)) return false;

    if (!priceInRange(row, priceMin, priceMax)) return false;
    if (roomsMin != null && row.rooms < roomsMin) return false;
    if (m2Min != null && row.m2_built < m2Min) return false;

    if (features.length > 0) {
      const active = new Set(getActiveFeatures(row.features));
      if (!features.every((f) => active.has(f))) return false;
    }

    if (assignee !== 'any') {
      if (assignee === 'unassigned') {
        if (row.assigned_to_user_id != null) return false;
      } else if (assignee === 'mine') {
        if (viewerId == null || row.assigned_to_user_id !== viewerId) return false;
      } else {
        const id = Number(assignee);
        if (!Number.isFinite(id) || row.assigned_to_user_id !== id) return false;
      }
    }

    return true;
  });
}

export function rowsForPropertyTab(
  rows: PropertyListRow[],
  tab: PropertyTabKey,
  filters: PropertyFilterParams,
): PropertyListRow[] {
  const filtered = applyPropertyFilters(rows, filters);
  if (tab === 'all') return filtered;
  return filtered.filter((r) => matchesPropertyTab(r, tab));
}

// ---------------------------------------------------------------------------
// URL param parsers
// ---------------------------------------------------------------------------

export function parsePropertyTab(value: string | null | undefined): PropertyTabKey {
  if (value && (ALL_TABS as readonly string[]).includes(value)) return value as PropertyTabKey;
  return 'all';
}

export function parseCsvStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseNumOrNull(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function countActivePropertyFilters(filters: PropertyFilterParams): number {
  let n = 0;
  if ((filters.q ?? '').trim().length > 0) n += 1;
  if ((filters.types ?? []).length > 0) n += 1;
  if ((filters.statuses ?? []).length > 0) n += 1;
  if ((filters.neighborhoods ?? []).length > 0) n += 1;
  if (filters.priceMin != null || filters.priceMax != null) n += 1;
  if (filters.roomsMin != null) n += 1;
  if (filters.m2Min != null) n += 1;
  if ((filters.features ?? []).length > 0) n += 1;
  if ((filters.assignee ?? 'any') !== 'any') n += 1;
  return n;
}
