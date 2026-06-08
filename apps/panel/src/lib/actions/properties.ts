'use server';

/**
 * F7 / S1 — Server Actions del catálogo de inmuebles (`/properties`).
 *
 * Módulo NUEVO (no port de SETTER), construido sobre la doctrina de Vega Hogar y
 * el patrón consolidado de `lib/actions/leads.ts`:
 *
 *  - **anon + RLS** siempre (`createSupabaseServerClient`). NUNCA service-role
 *    (regla 2). La RLS de `properties`/`property_photos`/`property_owners`/
 *    `lead_property_interest` (Fase 1) filtra por tenant + rol; el código NO la
 *    replica.
 *  - **Shim de auth F3**: `getEffectiveTenant()` + `requireTenantRoleAtLeast()`.
 *  - **Gates** (matriz `properties.*` + RLS):
 *      · ver catálogo/fotos → cualquier miembro (RLS SELECT = todo el tenant).
 *      · crear/editar/archivar/fotos → director_oficina+ (`authorizeWrite('admin')`).
 *      · ver/editar propietarios → admin/dg/director_oficina/asistente_captador
 *        (set RLS exacto; comercial excluido — check explícito).
 *      · eliminar (soft-delete `deleted_at`) → admin (app-gate + guard BD trigger).
 *      · gestionar interés lead↔inmueble → cualquier miembro; RLS acota a leads visibles.
 *
 * Cliente untyped → `.select('literal de una línea')`; probes RLS obligatorias.
 * Los tipos de fila/filtros viven en `@/lib/property-list-query` (contrato estable).
 */

import { revalidatePath } from 'next/cache';

import type { EffectiveTenant } from '@/lib/auth/effective-tenant';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import type { SetterRole } from '@/lib/auth/require-tenant-role';
import { AuthError, requireTenantRoleAtLeast } from '@/lib/auth/require-tenant-role';
import type { UserRole } from '@/lib/auth/types';
import {
  applyPropertyFilters,
  type PropertyFilterParams,
  type PropertyInterestLead,
  type PropertyInterestRow,
  type PropertyListRow,
  type PropertyOwnerRow,
  type PropertyPhotoRow,
  type PropertyStatus,
  type PropertyType,
} from '@/lib/property-list-query';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// ---------------------------------------------------------------------------
// Tipos de I/O (contrato de las acciones)
// ---------------------------------------------------------------------------

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface PropertyCursor {
  createdAt: string;
  id: number;
}

export interface ListPropertiesPageInput {
  filters: PropertyFilterParams;
  cursor?: PropertyCursor | null;
  limit?: number;
}

export interface ListPropertiesPageResult {
  rows: PropertyListRow[];
  nextCursor: PropertyCursor | null;
  hasMore: boolean;
}

export interface PropertyDetail {
  property: PropertyListRow;
  photos: PropertyPhotoRow[];
  owners: PropertyOwnerRow[];
  interests: PropertyInterestRow[];
}

export interface PropertyInput {
  officeId: number;
  type: PropertyType;
  status: PropertyStatus;
  title: string;
  description?: string | null;
  priceEur?: number | null;
  monthlyRentEur?: number | null;
  m2Built: number;
  m2Useful?: number | null;
  rooms?: number;
  bathrooms?: number;
  yearBuilt?: number | null;
  neighborhood: string;
  addressShort?: string | null;
  features?: Record<string, unknown>;
  assignedToUserId?: number | null;
}

export type PropertyPatch = Partial<PropertyInput>;

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

const VALID_TYPES: readonly string[] = ['sale', 'rent'];
const VALID_STATUSES: readonly string[] = ['available', 'reserved', 'sold', 'rented', 'inactive'];
/** Roles que ven/gestionan propietarios (set RLS exacto; comercial NO). */
const OWNER_ROLES: readonly UserRole[] = [
  'admin',
  'director_general',
  'director_oficina',
  'asistente_captador',
];

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidId(id: number): boolean {
  return Number.isFinite(id) && id > 0;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
}

/** Sanitiza un valor para ILIKE de Supabase (wildcards + metacaracteres de `.or()`). */
function sanitizeIlike(value: string): string {
  return value.replace(/[,()%_]/g, '');
}

function trimNullable(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

// Literales de una sola línea (si se concatenan, el parser de supabase-js degrada
// el resultado a `GenericStringError`).
const PROPERTY_SELECT =
  'id, tenant_id, office_id, type, status, title, description, price_eur, monthly_rent_eur, m2_built, m2_useful, rooms, bathrooms, year_built, neighborhood, address_short, features, assigned_to_user_id, created_at, updated_at';

const PHOTO_SELECT = 'id, property_id, url, caption, sort_order';

const OWNER_SELECT = 'id, property_id, full_name, phone, email, notes, created_at, updated_at';

const INTEREST_SELECT = 'id, lead_id, property_id, status, notes, created_at, updated_at';

function mapPropertyRow(
  raw: Record<string, unknown>,
  thumbnailUrl: string | null,
): PropertyListRow {
  return {
    id: Number(raw.id),
    office_id: Number(raw.office_id),
    type: String(raw.type) as PropertyType,
    status: String(raw.status) as PropertyStatus,
    title: String(raw.title ?? ''),
    description: (raw.description as string | null) ?? null,
    price_eur: toNumOrNull(raw.price_eur),
    monthly_rent_eur: toNumOrNull(raw.monthly_rent_eur),
    m2_built: Number(raw.m2_built ?? 0),
    m2_useful: toNumOrNull(raw.m2_useful),
    rooms: Number(raw.rooms ?? 0),
    bathrooms: Number(raw.bathrooms ?? 0),
    year_built: toNumOrNull(raw.year_built),
    neighborhood: String(raw.neighborhood ?? ''),
    address_short: (raw.address_short as string | null) ?? null,
    features: (raw.features as Record<string, unknown> | null) ?? {},
    assigned_to_user_id: toNumOrNull(raw.assigned_to_user_id),
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
    thumbnail_url: thumbnailUrl,
  };
}

/** Foto principal (menor sort_order) por property — 2ª query desanidada. */
async function fetchThumbnails(
  supabase: ServerClient,
  propertyIds: number[],
): Promise<Map<number, string>> {
  const byProperty = new Map<number, { url: string; sort: number }>();
  if (propertyIds.length === 0) return new Map();

  const { data } = await supabase
    .from('property_photos')
    .select('property_id, url, sort_order')
    .in('property_id', propertyIds);

  for (const p of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = Number(p.property_id);
    const sort = Number(p.sort_order ?? 0);
    const prev = byProperty.get(pid);
    if (!prev || sort < prev.sort) byProperty.set(pid, { url: String(p.url), sort });
  }

  const out = new Map<number, string>();
  for (const [pid, v] of byProperty) out.set(pid, v.url);
  return out;
}

type WriteAuth =
  | { ok: true; eff: EffectiveTenant; supabase: ServerClient }
  | { ok: false; error: string };

/** Gate de escritura por rol mínimo (vocabulario shim). RLS = última defensa. */
async function authorizeWrite(minRole: SetterRole): Promise<WriteAuth> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };
  try {
    await requireTenantRoleAtLeast({ tenantId: eff.tenantId, minRole });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.code };
    throw e;
  }
  const supabase = await createSupabaseServerClient();
  return { ok: true, eff, supabase };
}

/** Gate para propietarios: set de roles RLS exacto (incluye asistente_captador). */
async function authorizeOwners(): Promise<WriteAuth> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };
  if (!OWNER_ROLES.includes(eff.role)) return { ok: false, error: 'FORBIDDEN_ROLE_REQUIRED' };
  const supabase = await createSupabaseServerClient();
  return { ok: true, eff, supabase };
}

// ---------------------------------------------------------------------------
// listPropertiesPage — prefiltros SQL + cursor keyset + post-filtros JS
// ---------------------------------------------------------------------------

export async function listPropertiesPage(
  input: ListPropertiesPageInput,
): Promise<ActionResult<ListPropertiesPageResult>> {
  const filters = input.filters ?? {};
  const cursor = input.cursor ?? null;
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));

  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();

  // RLS filtra tenant + rol. Solo el soft-delete se filtra a mano (siempre).
  let q = supabase.from('properties').select(PROPERTY_SELECT).is('deleted_at', null);

  // ---- Búsqueda libre ----
  const qStr = (filters.q ?? '').trim();
  if (qStr.length > 0) {
    const safe = sanitizeIlike(qStr);
    if (safe.length > 0) {
      q = q.or(
        [
          `title.ilike.%${safe}%`,
          `neighborhood.ilike.%${safe}%`,
          `address_short.ilike.%${safe}%`,
        ].join(','),
      );
    }
  }

  // ---- Filtros indexables ----
  if ((filters.types ?? []).length > 0) q = q.in('type', filters.types as string[]);
  if ((filters.statuses ?? []).length > 0) q = q.in('status', filters.statuses as string[]);
  if ((filters.neighborhoods ?? []).length > 0)
    q = q.in('neighborhood', filters.neighborhoods as string[]);
  if (filters.roomsMin != null) q = q.gte('rooms', filters.roomsMin);
  if (filters.m2Min != null) q = q.gte('m2_built', filters.m2Min);

  // ---- assignee ----
  if (filters.assignee && filters.assignee !== 'any') {
    if (filters.assignee === 'unassigned') {
      q = q.is('assigned_to_user_id', null);
    } else if (filters.assignee === 'mine') {
      q = q.eq('assigned_to_user_id', eff.userId);
    } else {
      const id = Number(filters.assignee);
      if (Number.isFinite(id)) q = q.eq('assigned_to_user_id', id);
    }
  }

  // ---- Cursor keyset (created_at DESC, id DESC) ----
  if (cursor) {
    q = q.or(
      [
        `created_at.lt.${cursor.createdAt}`,
        `and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      ].join(','),
    );
  }

  const pageQuery = q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  const { data, error } = await pageQuery;
  if (error) return { ok: false, error: error.message };

  const allRaw = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = allRaw.length > limit;
  const visibleRaw = hasMore ? allRaw.slice(0, limit) : allRaw;

  // nextCursor desde el último row de la página SQL (antes de los post-filtros JS).
  let nextCursor: PropertyCursor | null = null;
  if (hasMore && visibleRaw.length > 0) {
    const last = visibleRaw[visibleRaw.length - 1];
    nextCursor = { createdAt: String(last.created_at), id: Number(last.id) };
  }

  const propertyIds = visibleRaw.map((r) => Number(r.id));
  const thumbnails = await fetchThumbnails(supabase, propertyIds);

  const rows: PropertyListRow[] = visibleRaw.map((raw) =>
    mapPropertyRow(raw, thumbnails.get(Number(raw.id)) ?? null),
  );

  // Post-filtros que SQL no expresa de forma simple: precio (cruza dos columnas)
  // y features (jsonb). El resto ya es autoridad de SQL → no se re-aplica aquí.
  const filtered = applyPropertyFilters(rows, {
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    features: filters.features,
  });

  return { ok: true, data: { rows: filtered, nextCursor, hasMore } };
}

// ---------------------------------------------------------------------------
// getPropertyDetail — ficha completa por propertyId
// ---------------------------------------------------------------------------

export async function getPropertyDetail(propertyId: number): Promise<ActionResult<PropertyDetail>> {
  if (!isValidId(propertyId)) return { ok: false, error: 'invalid_propertyId' };

  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();

  const { data: propRaw, error: propErr } = await supabase
    .from('properties')
    .select(PROPERTY_SELECT)
    .eq('id', propertyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (propErr) return { ok: false, error: propErr.message };
  if (!propRaw) return { ok: false, error: 'not_found' };

  const [photosRes, ownersRes, interestsRes] = await Promise.all([
    supabase
      .from('property_photos')
      .select(PHOTO_SELECT)
      .eq('property_id', propertyId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('property_owners')
      .select(OWNER_SELECT)
      .eq('property_id', propertyId)
      .order('id', { ascending: true }),
    supabase
      .from('lead_property_interest')
      .select(INTEREST_SELECT)
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false }),
  ]);

  const property = mapPropertyRow(propRaw as Record<string, unknown>, null);

  const photos: PropertyPhotoRow[] = ((photosRes.data ?? []) as Array<Record<string, unknown>>).map(
    (p) => ({
      id: Number(p.id),
      url: String(p.url),
      caption: (p.caption as string | null) ?? null,
      sort_order: Number(p.sort_order ?? 0),
    }),
  );

  // property_owners SELECT está acotada por RLS (comercial → 0 filas, sin error).
  const owners: PropertyOwnerRow[] = ((ownersRes.data ?? []) as Array<Record<string, unknown>>).map(
    (o) => ({
      id: Number(o.id),
      full_name: String(o.full_name ?? ''),
      phone: (o.phone as string | null) ?? null,
      email: (o.email as string | null) ?? null,
      notes: (o.notes as string | null) ?? null,
    }),
  );

  // Leads interesados (2ª query desanidada; RLS acota a leads visibles).
  const interestRaw = (interestsRes.data ?? []) as Array<Record<string, unknown>>;
  const leadIds = Array.from(new Set(interestRaw.map((r) => Number(r.lead_id))));
  const leadById = new Map<number, PropertyInterestLead>();
  if (leadIds.length > 0) {
    const { data: leadsRaw } = await supabase
      .from('leads')
      .select('id, full_name, phone, intent, status, assigned_to_user_id')
      .in('id', leadIds);
    for (const l of (leadsRaw ?? []) as Array<Record<string, unknown>>) {
      leadById.set(Number(l.id), {
        id: Number(l.id),
        full_name: (l.full_name as string | null) ?? null,
        phone: (l.phone as string | null) ?? null,
        intent: String(l.intent ?? 'unknown'),
        status: String(l.status ?? 'new'),
        assigned_to_user_id: toNumOrNull(l.assigned_to_user_id),
      });
    }
  }
  const interests: PropertyInterestRow[] = interestRaw.map((r) => ({
    id: Number(r.id),
    lead_id: Number(r.lead_id),
    status: String(r.status ?? 'interested'),
    notes: (r.notes as string | null) ?? null,
    lead: leadById.get(Number(r.lead_id)) ?? null,
  }));

  return { ok: true, data: { property, photos, owners, interests } };
}

// ---------------------------------------------------------------------------
// createProperty / updateProperty / archiveProperty / deleteProperty
// ---------------------------------------------------------------------------

/** Normaliza precio↔tipo: venta usa price_eur, alquiler monthly_rent_eur. */
function priceColumnsFor(
  type: PropertyType,
  priceEur: number | null | undefined,
  rentEur: number | null | undefined,
): { price_eur: number | null; monthly_rent_eur: number | null } {
  if (type === 'rent') return { price_eur: null, monthly_rent_eur: toNumOrNull(rentEur) };
  return { price_eur: toNumOrNull(priceEur), monthly_rent_eur: null };
}

export async function createProperty(
  input: PropertyInput,
): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeWrite('admin'); // director_oficina+
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const title = trimNullable(input.title);
  if (!title) return { ok: false, error: 'title_required' };
  if (!VALID_TYPES.includes(input.type)) return { ok: false, error: 'invalid_type' };
  if (!VALID_STATUSES.includes(input.status)) return { ok: false, error: 'invalid_status' };
  const neighborhood = trimNullable(input.neighborhood);
  if (!neighborhood) return { ok: false, error: 'neighborhood_required' };
  if (!isValidId(input.officeId)) return { ok: false, error: 'office_required' };
  const m2Built = toNumOrNull(input.m2Built);
  if (m2Built == null || m2Built <= 0) return { ok: false, error: 'm2_built_required' };

  const prices = priceColumnsFor(input.type, input.priceEur, input.monthlyRentEur);

  const row: Record<string, unknown> = {
    tenant_id: eff.tenantId,
    office_id: input.officeId,
    type: input.type,
    status: input.status,
    title,
    description: trimNullable(input.description),
    price_eur: prices.price_eur,
    monthly_rent_eur: prices.monthly_rent_eur,
    m2_built: m2Built,
    m2_useful: toNumOrNull(input.m2Useful),
    rooms: toNumOrNull(input.rooms) ?? 0,
    bathrooms: toNumOrNull(input.bathrooms) ?? 0,
    year_built: toNumOrNull(input.yearBuilt),
    neighborhood,
    address_short: trimNullable(input.addressShort),
    features: input.features ?? {},
    assigned_to_user_id: toNumOrNull(input.assignedToUserId),
  };

  const { data, error } = await supabase.from('properties').insert(row).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  revalidatePath('/properties');
  return { ok: true, data: { id: Number(data.id) } };
}

export async function updateProperty(input: {
  propertyId: number;
  patch: PropertyPatch;
}): Promise<ActionResult> {
  if (!isValidId(input.propertyId)) return { ok: false, error: 'invalid_propertyId' };

  const auth = await authorizeWrite('admin'); // director_oficina+
  if (!auth.ok) return auth;

  const patch = input.patch ?? {};
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.title !== undefined) {
    const t = trimNullable(patch.title);
    if (!t) return { ok: false, error: 'title_required' };
    updates.title = t;
  }
  if (patch.type !== undefined) {
    if (!VALID_TYPES.includes(patch.type)) return { ok: false, error: 'invalid_type' };
    updates.type = patch.type;
  }
  if (patch.status !== undefined) {
    if (!VALID_STATUSES.includes(patch.status)) return { ok: false, error: 'invalid_status' };
    updates.status = patch.status;
  }
  if (patch.neighborhood !== undefined) {
    const n = trimNullable(patch.neighborhood);
    if (!n) return { ok: false, error: 'neighborhood_required' };
    updates.neighborhood = n;
  }
  if (patch.officeId !== undefined) {
    if (!isValidId(patch.officeId)) return { ok: false, error: 'office_required' };
    updates.office_id = patch.officeId;
  }
  if (patch.m2Built !== undefined) {
    const m = toNumOrNull(patch.m2Built);
    if (m == null || m <= 0) return { ok: false, error: 'm2_built_required' };
    updates.m2_built = m;
  }
  if (patch.description !== undefined) updates.description = trimNullable(patch.description);
  if (patch.m2Useful !== undefined) updates.m2_useful = toNumOrNull(patch.m2Useful);
  if (patch.rooms !== undefined) updates.rooms = toNumOrNull(patch.rooms) ?? 0;
  if (patch.bathrooms !== undefined) updates.bathrooms = toNumOrNull(patch.bathrooms) ?? 0;
  if (patch.yearBuilt !== undefined) updates.year_built = toNumOrNull(patch.yearBuilt);
  if (patch.addressShort !== undefined) updates.address_short = trimNullable(patch.addressShort);
  if (patch.features !== undefined) updates.features = patch.features ?? {};
  if (patch.assignedToUserId !== undefined)
    updates.assigned_to_user_id = toNumOrNull(patch.assignedToUserId);

  // Precio↔tipo: si llega el tipo o cualquier precio, recalcular ambas columnas.
  if (patch.type !== undefined || patch.priceEur !== undefined || patch.monthlyRentEur !== undefined) {
    // Necesitamos el tipo efectivo: el del patch o el actual en BD.
    let effectiveType = patch.type;
    if (effectiveType === undefined) {
      const { data: cur } = await auth.supabase
        .from('properties')
        .select('type')
        .eq('id', input.propertyId)
        .maybeSingle();
      effectiveType = (cur?.type as PropertyType | undefined) ?? 'sale';
    }
    const prices = priceColumnsFor(effectiveType, patch.priceEur, patch.monthlyRentEur);
    updates.price_eur = prices.price_eur;
    updates.monthly_rent_eur = prices.monthly_rent_eur;
  }

  if (Object.keys(updates).length === 1) return { ok: true }; // solo updated_at → no-op

  const { error } = await auth.supabase
    .from('properties')
    .update(updates)
    .eq('id', input.propertyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/properties');
  revalidatePath(`/properties/${input.propertyId}`);
  return { ok: true };
}

/** Archivar = cambiar estado (sold/rented/inactive/…). director_oficina+. */
export async function archiveProperty(input: {
  propertyId: number;
  status: PropertyStatus;
}): Promise<ActionResult> {
  if (!isValidId(input.propertyId)) return { ok: false, error: 'invalid_propertyId' };
  if (!VALID_STATUSES.includes(input.status)) return { ok: false, error: 'invalid_status' };

  const auth = await authorizeWrite('admin'); // director_oficina+
  if (!auth.ok) return auth;

  const { error } = await auth.supabase
    .from('properties')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.propertyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/properties');
  revalidatePath(`/properties/${input.propertyId}`);
  return { ok: true };
}

/** Eliminar = soft-delete (`deleted_at`). admin-only (app-gate + guard BD trigger). */
export async function deleteProperty(propertyId: number): Promise<ActionResult> {
  if (!isValidId(propertyId)) return { ok: false, error: 'invalid_propertyId' };

  const auth = await authorizeWrite('admin');
  if (!auth.ok) return auth;
  // Supresión más estricta que la edición: SOLO admin (coincide con matriz
  // properties.delete=admin, RLS DELETE=admin y el guard BD sobre deleted_at).
  if (auth.eff.role !== 'admin') return { ok: false, error: 'FORBIDDEN_ROLE_REQUIRED' };

  const { data, error } = await auth.supabase
    .from('properties')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', propertyId)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'not_found' };

  revalidatePath('/properties');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fotos (URL v1) — gate director_oficina+ (foto = parte de editar el inmueble)
// ---------------------------------------------------------------------------

export async function addPropertyPhoto(input: {
  propertyId: number;
  url: string;
  caption?: string | null;
}): Promise<ActionResult<{ id: number }>> {
  if (!isValidId(input.propertyId)) return { ok: false, error: 'invalid_propertyId' };

  const auth = await authorizeWrite('admin'); // director_oficina+
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const url = (input.url ?? '').trim();
  if (!isHttpUrl(url)) return { ok: false, error: 'invalid_url' };

  // sort_order = max actual + 1.
  const { data: existing } = await supabase
    .from('property_photos')
    .select('sort_order')
    .eq('property_id', input.propertyId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const maxSort = ((existing ?? [])[0] as { sort_order: number } | undefined)?.sort_order ?? -1;

  const { data, error } = await supabase
    .from('property_photos')
    .insert({
      tenant_id: eff.tenantId,
      property_id: input.propertyId,
      url,
      caption: trimNullable(input.caption),
      sort_order: Number(maxSort) + 1,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  revalidatePath(`/properties/${input.propertyId}`);
  revalidatePath('/properties');
  return { ok: true, data: { id: Number(data.id) } };
}

export async function removePropertyPhoto(input: {
  propertyId: number;
  photoId: number;
}): Promise<ActionResult> {
  if (!isValidId(input.propertyId) || !isValidId(input.photoId)) {
    return { ok: false, error: 'invalid_id' };
  }

  const auth = await authorizeWrite('admin'); // director_oficina+
  if (!auth.ok) return auth;

  const { error } = await auth.supabase.from('property_photos').delete().eq('id', input.photoId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/properties/${input.propertyId}`);
  revalidatePath('/properties');
  return { ok: true };
}

export async function reorderPropertyPhotos(input: {
  propertyId: number;
  orderedPhotoIds: number[];
}): Promise<ActionResult> {
  if (!isValidId(input.propertyId)) return { ok: false, error: 'invalid_propertyId' };

  const auth = await authorizeWrite('admin'); // director_oficina+
  if (!auth.ok) return auth;

  const ids = (input.orderedPhotoIds ?? []).filter((id) => isValidId(id));
  for (let i = 0; i < ids.length; i += 1) {
    const { error } = await auth.supabase
      .from('property_photos')
      .update({ sort_order: i })
      .eq('id', ids[i])
      .eq('property_id', input.propertyId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/properties/${input.propertyId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Propietarios — gate set RLS (admin/dg/director_oficina/asistente_captador)
// ---------------------------------------------------------------------------

export async function addPropertyOwner(input: {
  propertyId: number;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}): Promise<ActionResult<{ id: number }>> {
  if (!isValidId(input.propertyId)) return { ok: false, error: 'invalid_propertyId' };

  const auth = await authorizeOwners();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const fullName = trimNullable(input.fullName);
  if (!fullName) return { ok: false, error: 'full_name_required' };
  const email = trimNullable(input.email);
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'invalid_email' };
  }

  const { data, error } = await supabase
    .from('property_owners')
    .insert({
      tenant_id: eff.tenantId,
      property_id: input.propertyId,
      full_name: fullName,
      phone: trimNullable(input.phone),
      email,
      notes: trimNullable(input.notes),
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  revalidatePath(`/properties/${input.propertyId}`);
  return { ok: true, data: { id: Number(data.id) } };
}

export async function updatePropertyOwner(input: {
  propertyId: number;
  ownerId: number;
  patch: { fullName?: string; phone?: string | null; email?: string | null; notes?: string | null };
}): Promise<ActionResult> {
  if (!isValidId(input.propertyId) || !isValidId(input.ownerId)) {
    return { ok: false, error: 'invalid_id' };
  }

  const auth = await authorizeOwners();
  if (!auth.ok) return auth;

  const patch = input.patch ?? {};
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.fullName !== undefined) {
    const f = trimNullable(patch.fullName);
    if (!f) return { ok: false, error: 'full_name_required' };
    updates.full_name = f;
  }
  if (patch.phone !== undefined) updates.phone = trimNullable(patch.phone);
  if (patch.email !== undefined) {
    const e = trimNullable(patch.email);
    if (e !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return { ok: false, error: 'invalid_email' };
    }
    updates.email = e;
  }
  if (patch.notes !== undefined) updates.notes = trimNullable(patch.notes);

  if (Object.keys(updates).length === 1) return { ok: true };

  const { error } = await auth.supabase
    .from('property_owners')
    .update(updates)
    .eq('id', input.ownerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/properties/${input.propertyId}`);
  return { ok: true };
}

export async function removePropertyOwner(input: {
  propertyId: number;
  ownerId: number;
}): Promise<ActionResult> {
  if (!isValidId(input.propertyId) || !isValidId(input.ownerId)) {
    return { ok: false, error: 'invalid_id' };
  }

  const auth = await authorizeOwners();
  if (!auth.ok) return auth;

  const { error } = await auth.supabase.from('property_owners').delete().eq('id', input.ownerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/properties/${input.propertyId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cruce lead↔inmueble (lead_property_interest) — cualquier miembro; RLS acota
// ---------------------------------------------------------------------------

function revalidateInterest(propertyId: number, leadId: number): void {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath('/properties');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
}

export async function addPropertyInterest(input: {
  propertyId: number;
  leadId: number;
  status?: string;
  notes?: string | null;
}): Promise<ActionResult> {
  if (!isValidId(input.propertyId) || !isValidId(input.leadId)) {
    return { ok: false, error: 'invalid_id' };
  }

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const status = trimNullable(input.status) ?? 'interested';

  const { error } = await supabase.from('lead_property_interest').upsert(
    {
      tenant_id: eff.tenantId,
      lead_id: input.leadId,
      property_id: input.propertyId,
      status,
      notes: trimNullable(input.notes),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'lead_id,property_id' },
  );
  if (error) return { ok: false, error: error.message };

  revalidateInterest(input.propertyId, input.leadId);
  return { ok: true };
}

export async function removePropertyInterest(input: {
  propertyId: number;
  leadId: number;
}): Promise<ActionResult> {
  if (!isValidId(input.propertyId) || !isValidId(input.leadId)) {
    return { ok: false, error: 'invalid_id' };
  }

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  const { error } = await auth.supabase
    .from('lead_property_interest')
    .delete()
    .eq('property_id', input.propertyId)
    .eq('lead_id', input.leadId);
  if (error) return { ok: false, error: error.message };

  revalidateInterest(input.propertyId, input.leadId);
  return { ok: true };
}

export async function updatePropertyInterestStatus(input: {
  propertyId: number;
  leadId: number;
  status: string;
  notes?: string | null;
}): Promise<ActionResult> {
  if (!isValidId(input.propertyId) || !isValidId(input.leadId)) {
    return { ok: false, error: 'invalid_id' };
  }

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  const status = trimNullable(input.status);
  if (!status) return { ok: false, error: 'invalid_status' };

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (input.notes !== undefined) updates.notes = trimNullable(input.notes);

  const { error } = await auth.supabase
    .from('lead_property_interest')
    .update(updates)
    .eq('property_id', input.propertyId)
    .eq('lead_id', input.leadId);
  if (error) return { ok: false, error: error.message };

  revalidateInterest(input.propertyId, input.leadId);
  return { ok: true };
}
