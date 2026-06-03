'use server';

/**
 * F5 / S2 — Server Actions de `/leads` (leads inmobiliarios).
 *
 * Port re-domain de `setters_ia/apps/panel/lib/actions/contacts.ts`, adaptado a
 * la doctrina de Vega Hogar:
 *
 *  - **anon + RLS** siempre (`createSupabaseServerClient`). NUNCA service-role
 *    en el panel (regla 2). La RLS de `leads` (Fase 1) ya filtra por rol:
 *    comercial → sus leads asignados · director_oficina → su oficina ·
 *    admin/director_general/asistente_captador → todo el tenant. El código NO
 *    replica ese filtrado.
 *  - **Shim de auth F3**: `getEffectiveTenant()` (userId BigInt + tenantId +
 *    email) y `requireTenantRoleAtLeast()` para los gates de escritura.
 *  - **Asignación a nivel LEAD** (`leads.assigned_to_user_id` BigInt), no por
 *    conversación como SETTER.
 *  - **Modelo de permisos "solo gestores"** (decisión Iván, F5): editar datos
 *    maestros y (re)asignar = director_oficina+ (`minRole: 'admin'`); pausar IA,
 *    etiquetar y notar = cualquier miembro (`minRole: 'viewer'`), acotado por RLS
 *    a los leads que ve.
 *  - **Sin envío de mensajes** (depende de motor + YCloud → F10). S2 es lectura
 *    + gestión de BD.
 *
 * Los tipos de fila/filtros y los helpers de clasificación viven en
 * `@/lib/lead-list-query` (S1, contrato estable). Este archivo solo añade los
 * tipos de I/O de las acciones (type-only exports, se borran en compilación →
 * válidos en un módulo `'use server'`).
 */

import { revalidatePath } from 'next/cache';

import type { EffectiveTenant } from '@/lib/auth/effective-tenant';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import type { SetterRole } from '@/lib/auth/require-tenant-role';
import { AuthError, requireTenantRoleAtLeast } from '@/lib/auth/require-tenant-role';
import {
  applyFilters,
  type DestinationBucket,
  type LeadFilterParams,
  type LeadIntent,
  type LeadListConv,
  type LeadListLabel,
  type LeadListRow,
  type LeadStatus,
} from '@/lib/lead-list-query';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// ---------------------------------------------------------------------------
// Tipos de I/O (contrato de las acciones)
// ---------------------------------------------------------------------------

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface CursorParam {
  lastMessageAt: string | null;
  id: number;
}

export interface ListLeadsPageInput {
  filters: LeadFilterParams;
  cursor?: CursorParam | null;
  limit?: number;
}

export interface ListLeadsPageResult {
  rows: LeadListRow[];
  nextCursor: CursorParam | null;
  hasMore: boolean;
}

export interface LeadPreferenceRow {
  type: string; // property_type: 'sale' | 'rent'
  neighborhoods: string[];
  priceMinEur: number | null;
  priceMaxEur: number | null;
  roomsMin: number | null;
  m2Min: number | null;
  urgency: string | null;
  motives: string | null;
  featuresRequired: Record<string, unknown>;
}

export interface PropertyInterestProperty {
  id: number;
  title: string;
  type: string;
  status: string;
  priceEur: number | null;
  monthlyRentEur: number | null;
  m2Built: number | null;
  rooms: number | null;
  neighborhood: string | null;
}

export interface PropertyInterestRow {
  propertyId: number;
  status: string;
  notes: string | null;
  property: PropertyInterestProperty | null;
}

export interface LeadPipelineEvent {
  id: number;
  conversationId: number;
  eventType: string;
  fromValue: string | null;
  toValue: string;
  source: string;
  occurredAt: string;
}

export interface LeadNote {
  id: number;
  conversationId: number;
  content: string;
  authorEmail: string | null;
  createdAt: string;
}

export interface LeadDetail {
  lead: LeadListRow;
  preferences: LeadPreferenceRow[];
  propertyInterests: PropertyInterestRow[];
  events: LeadPipelineEvent[];
  notes: LeadNote[];
}

export interface UpdateLeadPatch {
  full_name?: string | null;
  phone?: string;
  email?: string | null;
  intent?: LeadIntent;
  location?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

const VALID_INTENTS: readonly string[] = ['buyer', 'tenant', 'seller', 'landlord', 'unknown'];

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sanitiza un valor para usarlo en ILIKE de Supabase. `%`/`_` son wildcards SQL
 * y la coma/paréntesis son metacaracteres en `.or()` de PostgREST → se eliminan.
 */
function sanitizeIlike(value: string): string {
  return value.replace(/[,()%_]/g, '');
}

function mapConv(raw: Record<string, unknown>, labels: LeadListLabel[]): LeadListConv {
  return {
    id: Number(raw.id),
    channel: String(raw.channel),
    status: String(raw.status),
    current_phase: Number(raw.current_phase ?? 0),
    is_qualified: (raw.is_qualified as boolean | null) ?? null,
    is_handoff_to_human: Boolean(raw.is_handoff_to_human),
    is_blocked: Boolean(raw.is_blocked),
    ai_paused_until: (raw.ai_paused_until as string | null) ?? null,
    last_message_at: (raw.last_message_at as string | null) ?? null,
    labels,
  };
}

function mapLeadRow(raw: Record<string, unknown>, conversations: LeadListConv[]): LeadListRow {
  return {
    id: Number(raw.id),
    full_name: (raw.full_name as string | null) ?? null,
    phone: (raw.phone as string | null) ?? null,
    email: (raw.email as string | null) ?? null,
    location: (raw.location as string | null) ?? null,
    intent: String(raw.intent ?? 'unknown') as LeadIntent,
    status: String(raw.status ?? 'new') as LeadStatus,
    current_phase: Number(raw.current_phase ?? 0),
    assigned_to_user_id: toNumOrNull(raw.assigned_to_user_id),
    external_id: (raw.external_id as string | null) ?? null,
    notes: (raw.source_notes as string | null) ?? null, // DB: source_notes → contrato: notes
    last_message_at: (raw.last_message_at as string | null) ?? null,
    created_at: String(raw.created_at),
    conversations,
  };
}

// Literales de una sola línea: TS infiere el tipo literal (no `string`), así el
// parser de `.select()` de Supabase no degrada el resultado a `GenericStringError`.
const LEAD_SELECT =
  'id, full_name, phone, email, location, intent, status, current_phase, assigned_to_user_id, external_id, source_notes, last_message_at, created_at';

const CONV_SELECT =
  'id, lead_id, channel, status, current_phase, is_qualified, is_handoff_to_human, is_blocked, ai_paused_until, last_message_at';

/** Conversaciones de un conjunto de leads, con sus etiquetas (2 queries desanidadas). */
async function fetchConversationsForLeads(
  supabase: ServerClient,
  leadIds: number[],
): Promise<Map<number, LeadListConv[]>> {
  const byLead = new Map<number, LeadListConv[]>();
  if (leadIds.length === 0) return byLead;

  const { data: convRaw } = await supabase
    .from('conversations')
    .select(CONV_SELECT)
    .in('lead_id', leadIds);

  const convs = (convRaw ?? []) as Array<Record<string, unknown>>;
  const convIds = convs.map((c) => Number(c.id));
  const labelsByConv = await fetchLabelsByConvId(supabase, convIds);

  for (const c of convs) {
    const conv = mapConv(c, labelsByConv.get(Number(c.id)) ?? []);
    const leadId = Number(c.lead_id);
    const arr = byLead.get(leadId) ?? [];
    arr.push(conv);
    byLead.set(leadId, arr);
  }
  return byLead;
}

/** Etiquetas por conversación: conversation_labels + tenant_labels, join en JS. */
async function fetchLabelsByConvId(
  supabase: ServerClient,
  conversationIds: number[],
): Promise<Map<number, LeadListLabel[]>> {
  const map = new Map<number, LeadListLabel[]>();
  if (conversationIds.length === 0) return map;

  const { data: clRaw } = await supabase
    .from('conversation_labels')
    .select('conversation_id, label_id')
    .in('conversation_id', conversationIds);

  const links = (clRaw ?? []) as Array<{ conversation_id: number; label_id: number }>;
  const labelIds = Array.from(new Set(links.map((l) => Number(l.label_id))));
  if (labelIds.length === 0) return map;

  const { data: tlRaw } = await supabase
    .from('tenant_labels')
    .select('id, name, color, destination_bucket')
    .in('id', labelIds);

  const labelById = new Map<number, LeadListLabel>();
  for (const t of (tlRaw ?? []) as Array<Record<string, unknown>>) {
    labelById.set(Number(t.id), {
      id: Number(t.id),
      name: String(t.name),
      color: String(t.color),
      destination_bucket: (t.destination_bucket ?? null) as DestinationBucket | null,
    });
  }

  for (const link of links) {
    const label = labelById.get(Number(link.label_id));
    if (!label) continue;
    const convId = Number(link.conversation_id);
    const arr = map.get(convId) ?? [];
    arr.push(label);
    map.set(convId, arr);
  }
  return map;
}

/** Ids de conversación de un lead (RLS acota por visibilidad del lead). */
async function getLeadConversationIds(supabase: ServerClient, leadId: number): Promise<number[]> {
  const { data } = await supabase.from('conversations').select('id').eq('lead_id', leadId);
  return ((data ?? []) as Array<{ id: number }>).map((c) => Number(c.id));
}

type WriteAuth =
  | { ok: true; eff: EffectiveTenant; supabase: ServerClient }
  | { ok: false; error: string };

/**
 * Gate común de escritura: sesión válida + rol mínimo (vocabulario shim
 * 'owner'|'admin'|'viewer'). Devuelve el contexto efectivo + cliente anon+RLS.
 * La RLS sigue siendo la última línea de defensa a nivel de fila.
 */
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

function isValidLeadId(leadId: number): boolean {
  return Number.isFinite(leadId) && leadId > 0;
}

// ---------------------------------------------------------------------------
// listLeadsPage — filtros SQL lead-level + cursor keyset + post-filtros JS
// ---------------------------------------------------------------------------

export async function listLeadsPage(
  input: ListLeadsPageInput,
): Promise<ActionResult<ListLeadsPageResult>> {
  const filters = input.filters ?? {};
  const cursor = input.cursor ?? null;
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));

  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();

  // RLS filtra tenant + rol. No se filtra a mano.
  let q = supabase.from('leads').select(LEAD_SELECT);

  // ---- Búsqueda libre (lead-level) ----
  const qStr = (filters.q ?? '').trim();
  if (qStr.length > 0) {
    const safe = sanitizeIlike(qStr);
    if (safe.length > 0) {
      q = q.or(
        [
          `full_name.ilike.%${safe}%`,
          `phone.ilike.%${safe}%`,
          `email.ilike.%${safe}%`,
          `external_id.ilike.%${safe}%`,
          `location.ilike.%${safe}%`,
        ].join(','),
      );
    }
  }

  // ---- intent / status (lead-level, indexables) ----
  if ((filters.intents ?? []).length > 0) q = q.in('intent', filters.intents as string[]);
  if ((filters.statuses ?? []).length > 0) q = q.in('status', filters.statuses as string[]);

  // ---- assignee (nivel LEAD) ----
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

  // ---- rangos de fecha ----
  if (filters.createdFrom) q = q.gte('created_at', filters.createdFrom);
  if (filters.createdTo) q = q.lte('created_at', filters.createdTo);
  if (filters.lastMsgNever) {
    q = q.is('last_message_at', null);
  } else {
    if (filters.lastMsgFrom) q = q.gte('last_message_at', filters.lastMsgFrom);
    if (filters.lastMsgTo) q = q.lte('last_message_at', filters.lastMsgTo);
  }

  // ---- Cursor keyset (last_message_at DESC NULLS LAST, id DESC) ----
  if (cursor) {
    if (cursor.lastMessageAt !== null) {
      q = q.or(
        [
          `last_message_at.lt.${cursor.lastMessageAt}`,
          `and(last_message_at.eq.${cursor.lastMessageAt},id.lt.${cursor.id})`,
          `last_message_at.is.null`,
        ].join(','),
      );
    } else {
      q = q.is('last_message_at', null).lt('id', cursor.id);
    }
  }

  const pageQuery = q
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  const { data, error } = await pageQuery;
  if (error) return { ok: false, error: error.message };

  const allRaw = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = allRaw.length > limit;
  const visibleRaw = hasMore ? allRaw.slice(0, limit) : allRaw;

  // nextCursor desde el último row de la página SQL (antes de filtros JS) → la
  // ventana avanza aunque los post-filtros dejen menos rows visibles.
  let nextCursor: CursorParam | null = null;
  if (hasMore && visibleRaw.length > 0) {
    const last = visibleRaw[visibleRaw.length - 1];
    nextCursor = { lastMessageAt: (last.last_message_at as string | null) ?? null, id: Number(last.id) };
  }

  const leadIds = visibleRaw.map((r) => Number(r.id));
  const convsByLead = await fetchConversationsForLeads(supabase, leadIds);

  const rows: LeadListRow[] = visibleRaw.map((raw) =>
    mapLeadRow(raw, convsByLead.get(Number(raw.id)) ?? []),
  );

  // Post-filtros que SQL no puede expresar (cruzan lead+conversaciones).
  // SQL ya es autoridad para q/intents/statuses/assignee/fechas → NO se
  // re-aplican aquí (evita el bug de 'mine' sin viewerId y el desajuste de
  // sanitización de `q`). Solo: phases (getMaxPhase lead+conv), labelIds,
  // aiState, blocked. Helper puro de S1.
  const filtered = applyFilters(rows, {
    phases: filters.phases,
    labelIds: filters.labelIds,
    aiState: filters.aiState,
    blocked: filters.blocked,
  });

  return { ok: true, data: { rows: filtered, nextCursor, hasMore } };
}

// ---------------------------------------------------------------------------
// getLeadDetail — ficha completa por leadId
// ---------------------------------------------------------------------------

export async function getLeadDetail(leadId: number): Promise<ActionResult<LeadDetail>> {
  if (!isValidLeadId(leadId)) return { ok: false, error: 'invalid_leadId' };

  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();

  const { data: leadRaw, error: leadErr } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) return { ok: false, error: leadErr.message };
  if (!leadRaw) return { ok: false, error: 'not_found' };

  // Conversaciones + etiquetas del lead.
  const { data: convRaw, error: convErr } = await supabase
    .from('conversations')
    .select(CONV_SELECT)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (convErr) return { ok: false, error: convErr.message };

  const convs = (convRaw ?? []) as Array<Record<string, unknown>>;
  const convIds = convs.map((c) => Number(c.id));

  // Lanzar en paralelo: labels, preferencias, inmuebles de interés, eventos, notas.
  const labelsPromise = fetchLabelsByConvId(supabase, convIds);

  const preferencesPromise = supabase
    .from('lead_preferences')
    .select('type, neighborhoods, price_min_eur, price_max_eur, rooms_min, m2_min, features_required, urgency, motives')
    .eq('lead_id', leadId);

  const interestsPromise = supabase
    .from('lead_property_interest')
    .select('property_id, status, notes')
    .eq('lead_id', leadId);

  const eventsPromise =
    convIds.length > 0
      ? supabase
          .from('pipeline_events')
          .select('id, conversation_id, event_type, from_value, to_value, source, occurred_at')
          .in('conversation_id', convIds)
          .order('occurred_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as unknown[], error: null });

  const notesPromise =
    convIds.length > 0
      ? supabase
          .from('conversation_notes')
          .select('id, conversation_id, content, author_email, created_at')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as unknown[], error: null });

  const [labelsByConv, prefsRes, interestsRes, eventsRes, notesRes] = await Promise.all([
    labelsPromise,
    preferencesPromise,
    interestsPromise,
    eventsPromise,
    notesPromise,
  ]);

  const conversations: LeadListConv[] = convs.map((c) =>
    mapConv(c, labelsByConv.get(Number(c.id)) ?? []),
  );
  const lead = mapLeadRow(leadRaw as Record<string, unknown>, conversations);

  const preferences: LeadPreferenceRow[] = (
    (prefsRes.data ?? []) as Array<Record<string, unknown>>
  ).map((p) => ({
    type: String(p.type),
    neighborhoods: Array.isArray(p.neighborhoods) ? (p.neighborhoods as string[]) : [],
    priceMinEur: toNumOrNull(p.price_min_eur),
    priceMaxEur: toNumOrNull(p.price_max_eur),
    roomsMin: toNumOrNull(p.rooms_min),
    m2Min: toNumOrNull(p.m2_min),
    urgency: (p.urgency as string | null) ?? null,
    motives: (p.motives as string | null) ?? null,
    featuresRequired: (p.features_required as Record<string, unknown> | null) ?? {},
  }));

  // Inmuebles de interés + datos del inmueble (2 queries, join JS).
  const interestRows = (interestsRes.data ?? []) as Array<Record<string, unknown>>;
  const propertyIds = Array.from(new Set(interestRows.map((r) => Number(r.property_id))));
  const propertyById = new Map<number, PropertyInterestProperty>();
  if (propertyIds.length > 0) {
    const { data: propRaw } = await supabase
      .from('properties')
      .select(
        'id, title, type, status, price_eur, monthly_rent_eur, m2_built, rooms, neighborhood',
      )
      .in('id', propertyIds);
    for (const pr of (propRaw ?? []) as Array<Record<string, unknown>>) {
      propertyById.set(Number(pr.id), {
        id: Number(pr.id),
        title: String(pr.title),
        type: String(pr.type),
        status: String(pr.status),
        priceEur: toNumOrNull(pr.price_eur),
        monthlyRentEur: toNumOrNull(pr.monthly_rent_eur),
        m2Built: toNumOrNull(pr.m2_built),
        rooms: toNumOrNull(pr.rooms),
        neighborhood: (pr.neighborhood as string | null) ?? null,
      });
    }
  }
  const propertyInterests: PropertyInterestRow[] = interestRows.map((r) => ({
    propertyId: Number(r.property_id),
    status: String(r.status),
    notes: (r.notes as string | null) ?? null,
    property: propertyById.get(Number(r.property_id)) ?? null,
  }));

  const events: LeadPipelineEvent[] = (
    (eventsRes.data ?? []) as Array<Record<string, unknown>>
  ).map((e) => ({
    id: Number(e.id),
    conversationId: Number(e.conversation_id),
    eventType: String(e.event_type),
    fromValue: (e.from_value as string | null) ?? null,
    toValue: String(e.to_value),
    source: String(e.source),
    occurredAt: String(e.occurred_at),
  }));

  const notes: LeadNote[] = ((notesRes.data ?? []) as Array<Record<string, unknown>>).map((n) => ({
    id: Number(n.id),
    conversationId: Number(n.conversation_id),
    content: String(n.content),
    authorEmail: (n.author_email as string | null) ?? null,
    createdAt: String(n.created_at),
  }));

  return { ok: true, data: { lead, preferences, propertyInterests, events, notes } };
}

// ---------------------------------------------------------------------------
// updateLead — datos maestros (gestores: director_oficina+)
// ---------------------------------------------------------------------------

export async function updateLead(input: {
  leadId: number;
  patch: UpdateLeadPatch;
}): Promise<ActionResult> {
  if (!isValidLeadId(input.leadId)) return { ok: false, error: 'invalid_leadId' };

  const auth = await authorizeWrite('admin'); // director_oficina+
  if (!auth.ok) return auth;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const trimNullable = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  };

  if (input.patch.full_name !== undefined) updates.full_name = trimNullable(input.patch.full_name);
  if (input.patch.location !== undefined) updates.location = trimNullable(input.patch.location);
  if (input.patch.phone !== undefined) {
    const p = trimNullable(input.patch.phone);
    if (!p) return { ok: false, error: 'phone_required' }; // columna NOT NULL
    updates.phone = p;
  }
  if (input.patch.email !== undefined) {
    const e = trimNullable(input.patch.email);
    if (e !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return { ok: false, error: 'invalid_email' };
    }
    updates.email = e;
  }
  if (input.patch.intent !== undefined) {
    if (!VALID_INTENTS.includes(input.patch.intent)) return { ok: false, error: 'invalid_intent' };
    updates.intent = input.patch.intent;
  }

  if (Object.keys(updates).length === 1) return { ok: true }; // solo updated_at → no-op

  const { error } = await auth.supabase.from('leads').update(updates).eq('id', input.leadId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/leads');
  revalidatePath(`/leads/${input.leadId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// assignLead — asignación a nivel LEAD (gestores: director_oficina+)
// ---------------------------------------------------------------------------

export async function assignLead(input: {
  leadId: number;
  userId: number | null;
}): Promise<ActionResult> {
  if (!isValidLeadId(input.leadId)) return { ok: false, error: 'invalid_leadId' };

  const auth = await authorizeWrite('admin'); // director_oficina+
  if (!auth.ok) return auth;

  // Verifica que el destinatario pertenece al tenant (RLS users_select solo
  // devuelve usuarios del tenant) y está activo.
  if (input.userId !== null) {
    if (!Number.isFinite(input.userId)) return { ok: false, error: 'invalid_userId' };
    const { data: target } = await auth.supabase
      .from('users')
      .select('id, active')
      .eq('id', input.userId)
      .maybeSingle();
    if (!target) return { ok: false, error: 'user_not_in_tenant' };
    if (target.active === false) return { ok: false, error: 'user_inactive' };
  }

  const { error } = await auth.supabase
    .from('leads')
    .update({ assigned_to_user_id: input.userId, updated_at: new Date().toISOString() })
    .eq('id', input.leadId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/leads');
  revalidatePath(`/leads/${input.leadId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// togglePauseLead — pausa/reanuda IA en las conversaciones del lead (miembros)
// ---------------------------------------------------------------------------

export async function togglePauseLead(input: {
  leadId: number;
  paused: boolean;
}): Promise<ActionResult> {
  if (!isValidLeadId(input.leadId)) return { ok: false, error: 'invalid_leadId' };

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  const { error } = await auth.supabase
    .from('conversations')
    .update({
      ai_paused_until: input.paused ? 'infinity' : null,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', input.leadId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/leads');
  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath('/conversations');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// applyLeadLabel / removeLeadLabel — etiquetas de conversación (miembros)
// ---------------------------------------------------------------------------

export async function applyLeadLabel(input: {
  leadId: number;
  labelId: number;
}): Promise<ActionResult> {
  if (!isValidLeadId(input.leadId)) return { ok: false, error: 'invalid_leadId' };
  if (!Number.isFinite(input.labelId) || input.labelId <= 0) {
    return { ok: false, error: 'invalid_labelId' };
  }

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  // Meta de la etiqueta (RLS tenant_labels_select acota al tenant).
  const { data: label } = await supabase
    .from('tenant_labels')
    .select('id, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to')
    .eq('id', input.labelId)
    .maybeSingle();
  if (!label) return { ok: false, error: 'invalid_label' };

  const convIds = await getLeadConversationIds(supabase, input.leadId);
  if (convIds.length === 0) return { ok: false, error: 'no_conversation' };

  // Upsert idempotente para todas las conversaciones del lead.
  const inserts = convIds.map((cid) => ({
    conversation_id: cid,
    label_id: input.labelId,
    tenant_id: eff.tenantId,
    applied_by: eff.userId,
    applied_via: 'manual' as const,
  }));
  const { error: insertErr } = await supabase
    .from('conversation_labels')
    .upsert(inserts, { onConflict: 'conversation_id,label_id', ignoreDuplicates: true });
  if (insertErr) return { ok: false, error: insertErr.message };

  // Side-effects (configurados en la etiqueta).
  if (label.pause_ai_on_apply) {
    await supabase
      .from('conversations')
      .update({ ai_paused_until: 'infinity', updated_at: new Date().toISOString() })
      .eq('lead_id', input.leadId);
  } else if (label.resume_ai_on_apply) {
    await supabase
      .from('conversations')
      .update({ ai_paused_until: null, updated_at: new Date().toISOString() })
      .eq('lead_id', input.leadId);
  }

  // auto_assign_to → asignación a nivel LEAD, solo si está sin asignar.
  const autoAssignTo = toNumOrNull(label.auto_assign_to);
  if (autoAssignTo !== null) {
    const { data: leadRow } = await supabase
      .from('leads')
      .select('assigned_to_user_id')
      .eq('id', input.leadId)
      .maybeSingle();
    if (leadRow && leadRow.assigned_to_user_id == null) {
      await supabase
        .from('leads')
        .update({ assigned_to_user_id: autoAssignTo, updated_at: new Date().toISOString() })
        .eq('id', input.leadId);
    }
  }

  revalidatePath('/leads');
  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath('/conversations');
  return { ok: true };
}

export async function removeLeadLabel(input: {
  leadId: number;
  labelId: number;
}): Promise<ActionResult> {
  if (!isValidLeadId(input.leadId)) return { ok: false, error: 'invalid_leadId' };
  if (!Number.isFinite(input.labelId) || input.labelId <= 0) {
    return { ok: false, error: 'invalid_labelId' };
  }

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  const convIds = await getLeadConversationIds(auth.supabase, input.leadId);
  if (convIds.length === 0) return { ok: true };

  const { error } = await auth.supabase
    .from('conversation_labels')
    .delete()
    .eq('label_id', input.labelId)
    .in('conversation_id', convIds);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/leads');
  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath('/conversations');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// addLeadNote — nota en la conversación más reciente del lead (miembros)
// ---------------------------------------------------------------------------

export async function addLeadNote(input: {
  leadId: number;
  content: string;
}): Promise<ActionResult<{ id: number }>> {
  if (!isValidLeadId(input.leadId)) return { ok: false, error: 'invalid_leadId' };

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const content = (input.content ?? '').trim();
  if (content.length === 0) return { ok: false, error: 'empty_note' };
  if (content.length > 4000) return { ok: false, error: 'note_too_long' };

  // Conversación más reciente del lead (las notas son conversation-scoped).
  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .eq('lead_id', input.leadId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1);
  const convId = ((convs ?? [])[0] as { id: number } | undefined)?.id;
  if (!convId) return { ok: false, error: 'no_conversation' };

  const { data, error } = await supabase
    .from('conversation_notes')
    .insert({
      conversation_id: convId,
      tenant_id: eff.tenantId,
      content,
      author_user_id: eff.userId,
      author_email: eff.email,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  revalidatePath('/leads');
  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath('/conversations');
  return { ok: true, data: { id: Number(data.id) } };
}
