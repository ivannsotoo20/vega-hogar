'use server';

/**
 * F8 / S1 — Server Actions de la agenda de visitas (`/visits`).
 *
 * Módulo NUEVO (no port de SETTER), construido sobre la doctrina de Vega Hogar y
 * el patrón consolidado de `lib/actions/properties.ts`:
 *
 *  - **anon + RLS** siempre (`createSupabaseServerClient`). NUNCA service-role
 *    (regla 2). La RLS de `visits` (Fase 1, `05-visits.sql`) filtra por tenant +
 *    rol (comercial → sus visitas; director_oficina → su oficina; admin/dg/
 *    asistente_captador → todas); el código NO la replica.
 *  - **Shim de auth F3**: `getEffectiveTenant()` + `requireTenantRoleAtLeast()`.
 *  - **Gates** (matriz `visits.*` + RLS):
 *      · ver agenda → cualquier miembro (RLS SELECT escopa la visibilidad).
 *      · crear visita → cualquier miembro (`visits.create`); el comercial solo se
 *        autoasigna (check explícito); el asistente_captador puede asignar al
 *        comercial de campo SOLO al crear una tasación (decisión F8 D4c=G2).
 *      · cambiar estado / notas → cualquier miembro (RLS acota a las visibles).
 *      · reasignar comercial → director_oficina+ (`authorizeWrite('admin')` mapea
 *        exactamente a `visits.reassign=[admin,dg,do]`; comercial/asistente fuera).
 *
 * Cliente untyped → `.select('literal de una línea')`; probes RLS obligatorias.
 * Los tipos de fila/filtros viven en `@/lib/visit-list-query` (contrato estable).
 * La denegación RLS de UPDATE = 0 filas (no 42501) → comprobamos `.select()` posterior.
 */

import { revalidatePath } from 'next/cache';

import type { EffectiveTenant } from '@/lib/auth/effective-tenant';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import type { SetterRole } from '@/lib/auth/require-tenant-role';
import { AuthError, requireTenantRoleAtLeast } from '@/lib/auth/require-tenant-role';
import { ROLE_HIERARCHY } from '@/lib/auth/types';
import {
  applyVisitFilters,
  type VisitFilterParams,
  type VisitComercialRef,
  type VisitLeadRef,
  type VisitListRow,
  type VisitPropertyRef,
  type VisitStatus,
} from '@/lib/visit-list-query';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// ---------------------------------------------------------------------------
// Tipos de I/O (contrato de las acciones)
// ---------------------------------------------------------------------------

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface VisitCursor {
  scheduledFor: string;
  id: number;
}

export interface ListVisitsPageInput {
  filters: VisitFilterParams;
  cursor?: VisitCursor | null;
  limit?: number;
}

export interface ListVisitsPageResult {
  rows: VisitListRow[];
  nextCursor: VisitCursor | null;
  hasMore: boolean;
}

export interface VisitDetail {
  visit: VisitListRow;
}

export interface CreateVisitInput {
  leadId: number;
  propertyId?: number | null;
  comercialUserId?: number | null;
  scheduledFor: string; // ISO datetime
  isTasation?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

const VALID_STATUSES: readonly string[] = ['scheduled', 'done', 'noshow', 'cancelled', 'rescheduled'];

/** Transiciones permitidas de la máquina de estados (inicial: scheduled). */
const TRANSITIONS: Record<VisitStatus, readonly VisitStatus[]> = {
  scheduled: ['done', 'noshow', 'cancelled', 'rescheduled'],
  rescheduled: ['scheduled', 'done', 'noshow', 'cancelled'],
  done: [],
  noshow: [],
  cancelled: [],
};

/** Nivel mínimo para asignar a otros (director_oficina+). */
const MANAGER_LEVEL = ROLE_HIERARCHY.director_oficina;

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidId(id: number): boolean {
  return Number.isFinite(id) && id > 0;
}

function trimNullable(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** Normaliza una fecha/datetime a ISO; null si no es parseable. */
function toIsoOrNull(v: unknown): string | null {
  const s = trimNullable(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function uniqueNums(values: Array<number | null>): number[] {
  return Array.from(new Set(values.filter((v): v is number => v != null && Number.isFinite(v))));
}

// Literal de una sola línea (si se concatena, supabase-js degrada a GenericStringError).
const VISIT_SELECT =
  'id, tenant_id, lead_id, property_id, comercial_user_id, scheduled_for, status, outcome_notes, lead_feedback, is_tasation, calendar_appointment_id, created_at, updated_at';

function mapVisitRow(
  raw: Record<string, unknown>,
  leadById: Map<number, VisitLeadRef>,
  propById: Map<number, VisitPropertyRef>,
  userById: Map<number, VisitComercialRef>,
): VisitListRow {
  const leadId = Number(raw.lead_id);
  const propId = raw.property_id != null ? Number(raw.property_id) : null;
  const comId = Number(raw.comercial_user_id);
  return {
    id: Number(raw.id),
    lead_id: leadId,
    property_id: propId,
    comercial_user_id: comId,
    scheduled_for: String(raw.scheduled_for),
    status: String(raw.status) as VisitStatus,
    outcome_notes: (raw.outcome_notes as string | null) ?? null,
    lead_feedback: (raw.lead_feedback as string | null) ?? null,
    is_tasation: raw.is_tasation === true,
    calendar_appointment_id:
      raw.calendar_appointment_id != null ? Number(raw.calendar_appointment_id) : null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
    lead: leadById.get(leadId) ?? null,
    property: propId != null ? (propById.get(propId) ?? null) : null,
    comercial: userById.get(comId) ?? null,
  };
}

/** Desanida lead/property/comercial con 2ª/3ª/4ª query `.in()` (RLS acota cada una). */
async function enrichVisits(
  supabase: ServerClient,
  rawRows: Array<Record<string, unknown>>,
): Promise<VisitListRow[]> {
  if (rawRows.length === 0) return [];

  const leadIds = uniqueNums(rawRows.map((r) => toNumOrNull(r.lead_id)));
  const propertyIds = uniqueNums(rawRows.map((r) => toNumOrNull(r.property_id)));
  const comercialIds = uniqueNums(rawRows.map((r) => toNumOrNull(r.comercial_user_id)));

  const [leadsRes, propsRes, usersRes] = await Promise.all([
    leadIds.length
      ? supabase.from('leads').select('id, full_name, phone, intent').in('id', leadIds)
      : Promise.resolve({ data: [] as unknown[] }),
    propertyIds.length
      ? supabase.from('properties').select('id, title, neighborhood').in('id', propertyIds)
      : Promise.resolve({ data: [] as unknown[] }),
    comercialIds.length
      ? supabase.from('users').select('id, full_name, email').in('id', comercialIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const leadById = new Map<number, VisitLeadRef>();
  for (const l of (leadsRes.data ?? []) as Array<Record<string, unknown>>) {
    leadById.set(Number(l.id), {
      id: Number(l.id),
      full_name: (l.full_name as string | null) ?? null,
      phone: (l.phone as string | null) ?? null,
      intent: String(l.intent ?? 'unknown'),
    });
  }

  const propById = new Map<number, VisitPropertyRef>();
  for (const p of (propsRes.data ?? []) as Array<Record<string, unknown>>) {
    propById.set(Number(p.id), {
      id: Number(p.id),
      title: String(p.title ?? ''),
      neighborhood: String(p.neighborhood ?? ''),
    });
  }

  const userById = new Map<number, VisitComercialRef>();
  for (const u of (usersRes.data ?? []) as Array<Record<string, unknown>>) {
    userById.set(Number(u.id), {
      id: Number(u.id),
      full_name: (u.full_name as string | null) ?? null,
      email: String(u.email ?? ''),
    });
  }

  return rawRows.map((raw) => mapVisitRow(raw, leadById, propById, userById));
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

/** Valida que un usuario destino existe en el tenant y está activo (patrón assignLead). */
async function assertAssignableUser(
  supabase: ServerClient,
  userId: number,
): Promise<string | null> {
  const { data: target } = await supabase
    .from('users')
    .select('id, active')
    .eq('id', userId)
    .maybeSingle();
  if (!target) return 'user_not_in_tenant';
  if ((target as { active?: boolean }).active === false) return 'user_inactive';
  return null;
}

// ---------------------------------------------------------------------------
// listVisitsPage — prefiltros SQL + cursor keyset + desanidado + post-filtros JS
// ---------------------------------------------------------------------------

export async function listVisitsPage(
  input: ListVisitsPageInput,
): Promise<ActionResult<ListVisitsPageResult>> {
  const filters = input.filters ?? {};
  const cursor = input.cursor ?? null;
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));

  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();

  // RLS filtra tenant + rol. Prefiltros SQL indexables (los nested `q` y el rango
  // de fechas se aplican en JS tras desanidar, como el price/features de F7).
  let q = supabase.from('visits').select(VISIT_SELECT);

  if ((filters.statuses ?? []).length > 0) q = q.in('status', filters.statuses as string[]);
  if (filters.visitType === 'tasation') q = q.eq('is_tasation', true);
  if (filters.visitType === 'visit') q = q.eq('is_tasation', false);

  if (filters.comercial && filters.comercial !== 'any') {
    if (filters.comercial === 'mine') {
      q = q.eq('comercial_user_id', eff.userId);
    } else {
      const id = Number(filters.comercial);
      if (Number.isFinite(id)) q = q.eq('comercial_user_id', id);
    }
  }

  // ---- Cursor keyset (scheduled_for DESC, id DESC); scheduled_for NOT NULL → sin rama NULLS ----
  if (cursor) {
    q = q.or(
      [
        `scheduled_for.lt.${cursor.scheduledFor}`,
        `and(scheduled_for.eq.${cursor.scheduledFor},id.lt.${cursor.id})`,
      ].join(','),
    );
  }

  const pageQuery = q
    .order('scheduled_for', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  const { data, error } = await pageQuery;
  if (error) return { ok: false, error: error.message };

  const allRaw = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = allRaw.length > limit;
  const visibleRaw = hasMore ? allRaw.slice(0, limit) : allRaw;

  // nextCursor desde el último row de la página SQL (antes de los post-filtros JS).
  let nextCursor: VisitCursor | null = null;
  if (hasMore && visibleRaw.length > 0) {
    const last = visibleRaw[visibleRaw.length - 1];
    nextCursor = { scheduledFor: String(last.scheduled_for), id: Number(last.id) };
  }

  const rows = await enrichVisits(supabase, visibleRaw);

  // Post-filtros que SQL no expresa de forma simple: `q` (datos desanidados) y el
  // rango de fechas. El resto ya es autoridad de SQL → no se re-aplica aquí.
  const filtered = applyVisitFilters(rows, {
    q: filters.q,
    scheduledFrom: filters.scheduledFrom,
    scheduledTo: filters.scheduledTo,
  });

  return { ok: true, data: { rows: filtered, nextCursor, hasMore } };
}

// ---------------------------------------------------------------------------
// getVisitDetail — ficha por visitId
// ---------------------------------------------------------------------------

export async function getVisitDetail(visitId: number): Promise<ActionResult<VisitDetail>> {
  if (!isValidId(visitId)) return { ok: false, error: 'invalid_visitId' };

  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();

  const { data: raw, error } = await supabase
    .from('visits')
    .select(VISIT_SELECT)
    .eq('id', visitId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!raw) return { ok: false, error: 'not_found' };

  const rows = await enrichVisits(supabase, [raw as Record<string, unknown>]);
  return { ok: true, data: { visit: rows[0] } };
}

// ---------------------------------------------------------------------------
// createVisit — gate auto-asignación (D4c=G2)
// ---------------------------------------------------------------------------

export async function createVisit(input: CreateVisitInput): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeWrite('viewer'); // cualquier miembro (visits.create)
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  if (!isValidId(input.leadId)) return { ok: false, error: 'invalid_leadId' };
  const scheduledFor = toIsoOrNull(input.scheduledFor);
  if (!scheduledFor) return { ok: false, error: 'invalid_scheduled_for' };
  const propertyId = toNumOrNull(input.propertyId);
  if (propertyId != null && !isValidId(propertyId)) return { ok: false, error: 'invalid_propertyId' };
  const isTasation = input.isTasation === true;

  // Resolver comercial asignado según rol (D4c=G2).
  const isManager = ROLE_HIERARCHY[eff.role] >= MANAGER_LEVEL; // director_oficina+
  const requested = toNumOrNull(input.comercialUserId);
  let comercialUserId: number;
  if (isManager) {
    comercialUserId = requested ?? eff.userId;
  } else if (eff.role === 'asistente_captador' && isTasation) {
    // El captador puede asignar al comercial de campo SOLO al crear una tasación.
    comercialUserId = requested ?? eff.userId;
  } else {
    // comercial (o asistente creando visita normal) → solo se autoasigna.
    if (requested != null && requested !== eff.userId) {
      return { ok: false, error: 'FORBIDDEN_SELF_ASSIGN_ONLY' };
    }
    comercialUserId = eff.userId;
  }

  if (comercialUserId !== eff.userId) {
    const err = await assertAssignableUser(supabase, comercialUserId);
    if (err) return { ok: false, error: err };
  }

  const { data, error } = await supabase
    .from('visits')
    .insert({
      tenant_id: eff.tenantId,
      lead_id: input.leadId,
      property_id: propertyId,
      comercial_user_id: comercialUserId,
      scheduled_for: scheduledFor,
      status: 'scheduled',
      is_tasation: isTasation,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  revalidateVisit();
  return { ok: true, data: { id: Number(data.id) } };
}

// ---------------------------------------------------------------------------
// updateVisitStatus — transiciones de la máquina de estados
// ---------------------------------------------------------------------------

export async function updateVisitStatus(input: {
  visitId: number;
  status: VisitStatus;
  scheduledFor?: string | null;
  outcomeNotes?: string | null;
  leadFeedback?: string | null;
}): Promise<ActionResult> {
  if (!isValidId(input.visitId)) return { ok: false, error: 'invalid_visitId' };
  if (!VALID_STATUSES.includes(input.status)) return { ok: false, error: 'invalid_status' };

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  // Estado actual (RLS acota: si no es visible → not_found).
  const { data: cur, error: curErr } = await auth.supabase
    .from('visits')
    .select('id, status')
    .eq('id', input.visitId)
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (!cur) return { ok: false, error: 'not_found' };

  const current = String((cur as { status: string }).status) as VisitStatus;
  const next = input.status;
  if (next !== current && !TRANSITIONS[current].includes(next)) {
    return { ok: false, error: 'invalid_transition' };
  }

  const updates: Record<string, unknown> = { status: next, updated_at: new Date().toISOString() };

  if (input.scheduledFor !== undefined && input.scheduledFor !== null) {
    const iso = toIsoOrNull(input.scheduledFor);
    if (!iso) return { ok: false, error: 'invalid_scheduled_for' };
    updates.scheduled_for = iso;
  }
  if (input.outcomeNotes !== undefined) updates.outcome_notes = trimNullable(input.outcomeNotes);
  if (input.leadFeedback !== undefined) updates.lead_feedback = trimNullable(input.leadFeedback);

  const { data, error } = await auth.supabase
    .from('visits')
    .update(updates)
    .eq('id', input.visitId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'not_found' };

  revalidateVisit();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// updateVisitNotes — outcome_notes / lead_feedback
// ---------------------------------------------------------------------------

export async function updateVisitNotes(input: {
  visitId: number;
  outcomeNotes?: string | null;
  leadFeedback?: string | null;
}): Promise<ActionResult> {
  if (!isValidId(input.visitId)) return { ok: false, error: 'invalid_visitId' };

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.outcomeNotes !== undefined) updates.outcome_notes = trimNullable(input.outcomeNotes);
  if (input.leadFeedback !== undefined) updates.lead_feedback = trimNullable(input.leadFeedback);
  if (Object.keys(updates).length === 1) return { ok: true }; // solo updated_at → no-op

  const { data, error } = await auth.supabase
    .from('visits')
    .update(updates)
    .eq('id', input.visitId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'not_found' };

  revalidateVisit();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// reassignVisit — director_oficina+ (authorizeWrite('admin') = visits.reassign set)
// ---------------------------------------------------------------------------

export async function reassignVisit(input: {
  visitId: number;
  comercialUserId: number;
}): Promise<ActionResult> {
  if (!isValidId(input.visitId)) return { ok: false, error: 'invalid_visitId' };
  if (!isValidId(input.comercialUserId)) return { ok: false, error: 'invalid_comercial' };

  // `authorizeWrite('admin')` mapea a nivel ≥3 = {admin, director_general,
  // director_oficina} — exactamente `visits.reassign=[T,T,T,F,F]` (comercial y
  // asistente_captador, nivel 2, quedan fuera).
  const auth = await authorizeWrite('admin');
  if (!auth.ok) return auth;

  const err = await assertAssignableUser(auth.supabase, input.comercialUserId);
  if (err) return { ok: false, error: err };

  const { data, error } = await auth.supabase
    .from('visits')
    .update({ comercial_user_id: input.comercialUserId, updated_at: new Date().toISOString() })
    .eq('id', input.visitId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'not_found' };

  revalidateVisit();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// revalidate
// ---------------------------------------------------------------------------

function revalidateVisit(): void {
  revalidatePath('/visits');
  revalidatePath('/captacion'); // las tasaciones aparecen en el cockpit de captación
}
