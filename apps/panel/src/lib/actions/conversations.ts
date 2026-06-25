'use server';

/**
 * F6 / S3 — Server Actions de `/conversations` (inbox + thread).
 *
 * Port re-domain del conversation-layout de SETTER, adaptado a Vega:
 *  - **anon + RLS** siempre (`createSupabaseServerClient`). NUNCA service-role.
 *    La RLS de `conversations` (delegada al lead) ya filtra por rol/tenant.
 *  - Shim de auth F3 (`getEffectiveTenant` + `requireTenantRoleAtLeast`).
 *  - **Sin `sendManualMessage`**: el composer está deshabilitado (envío real = F10).
 *  - Asignación = nivel LEAD (no se usa `conversations.assigned_user_id`).
 *  - Columnas SETTER → Vega: `source`→`role`, `sent_at`→`created_at`,
 *    `channel_id`(tabla)→`channel`(enum), `phase_number`/`state`→`current_phase`/`status`.
 */

import { revalidatePath } from 'next/cache';

import type { EffectiveTenant } from '@/lib/auth/effective-tenant';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import type { SetterRole } from '@/lib/auth/require-tenant-role';
import { AuthError, requireTenantRoleAtLeast } from '@/lib/auth/require-tenant-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DestinationBucket, LeadIntent, LeadListLabel } from '@/lib/lead-list-query';
import type { ConversationFilterParams, ConversationListRow } from '@/lib/conversation-list-query';
import { applyConvFilters } from '@/lib/conversation-list-query';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface CursorParam {
  lastMessageAt: string | null;
  id: number;
}

export interface ListConversationsPageInput {
  filters: ConversationFilterParams;
  cursor?: CursorParam | null;
  limit?: number;
}

export interface ListConversationsPageResult {
  rows: ConversationListRow[];
  nextCursor: CursorParam | null;
  hasMore: boolean;
}

export interface ThreadMessage {
  id: number;
  role: string; // lead | agent | human | system
  content: string;
  contentType: string;
  createdAt: string;
}

export interface ConvNote {
  id: number;
  content: string;
  authorEmail: string | null;
  createdAt: string;
}

/** Burbuja(s) que el motor "envió" por el driver mock (`mock_whatsapp_outbox`). */
export interface OutboxEntry {
  id: number;
  parts: string[];
  status: string;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: ConversationListRow;
  leadEmail: string | null;
  handoffCause: string | null;
  handoffReason: string | null;
  messages: ThreadMessage[];
  notes: ConvNote[];
  outbox: OutboxEntry[];
}

// Literales de una sola línea (evita GenericStringError del parser de .select()).
const CONV_SELECT =
  'id, lead_id, channel, status, current_phase, ai_paused_until, is_handoff_to_human, is_unread, is_blocked, last_message_at, created_at';
const CONV_DETAIL_SELECT =
  'id, lead_id, channel, status, current_phase, ai_paused_until, is_handoff_to_human, handoff_cause, handoff_reason, is_unread, is_blocked, last_message_at, created_at';

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeIlike(value: string): string {
  return value.replace(/[,()%_]/g, '');
}

interface LeadMeta {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  intent: LeadIntent;
  assigned_to_user_id: number | null;
}

/** Metadata de leads (nombre/intent/asignación) por id (1 query). */
async function fetchLeadsByIds(
  supabase: ServerClient,
  leadIds: number[],
): Promise<Map<number, LeadMeta>> {
  const map = new Map<number, LeadMeta>();
  if (leadIds.length === 0) return map;
  const { data } = await supabase
    .from('leads')
    .select('id, full_name, phone, email, intent, assigned_to_user_id')
    .in('id', leadIds);
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    map.set(Number(r.id), {
      full_name: (r.full_name as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      intent: String(r.intent ?? 'unknown') as LeadIntent,
      assigned_to_user_id: toNumOrNull(r.assigned_to_user_id),
    });
  }
  return map;
}

/** Etiquetas por conversación (2 queries desanidadas, join en JS). */
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

function mapRow(
  raw: Record<string, unknown>,
  lead: LeadMeta | undefined,
  labels: LeadListLabel[],
): ConversationListRow {
  return {
    id: Number(raw.id),
    lead_id: Number(raw.lead_id),
    lead_name: lead?.full_name ?? null,
    lead_phone: lead?.phone ?? null,
    intent: lead?.intent ?? 'unknown',
    channel: String(raw.channel),
    status: String(raw.status ?? 'active'),
    current_phase: Number(raw.current_phase ?? 0),
    ai_paused_until: (raw.ai_paused_until as string | null) ?? null,
    is_handoff_to_human: Boolean(raw.is_handoff_to_human),
    is_unread: Boolean(raw.is_unread),
    is_blocked: Boolean(raw.is_blocked),
    assigned_to_user_id: lead?.assigned_to_user_id ?? null,
    last_message_at: (raw.last_message_at as string | null) ?? null,
    created_at: String(raw.created_at),
    labels,
  };
}

type WriteAuth =
  | { ok: true; eff: EffectiveTenant; supabase: ServerClient }
  | { ok: false; error: string };

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

function isValidId(id: number): boolean {
  return Number.isFinite(id) && id > 0;
}

// ---------------------------------------------------------------------------
// listConversationsPage — cursor keyset + filtros SQL + post-filtros JS
// ---------------------------------------------------------------------------

export async function listConversationsPage(
  input: ListConversationsPageInput,
): Promise<ActionResult<ListConversationsPageResult>> {
  const filters = input.filters ?? {};
  const cursor = input.cursor ?? null;
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));

  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();
  let q = supabase.from('conversations').select(CONV_SELECT);

  // Búsqueda libre: resolver leads que matchean → filtrar conversaciones por lead_id.
  const qStr = (filters.q ?? '').trim();
  if (qStr.length > 0) {
    const safe = sanitizeIlike(qStr);
    if (safe.length > 0) {
      const { data: leadHits } = await supabase
        .from('leads')
        .select('id')
        .or([`full_name.ilike.%${safe}%`, `phone.ilike.%${safe}%`, `email.ilike.%${safe}%`].join(','));
      const ids = ((leadHits ?? []) as Array<{ id: number }>).map((l) => Number(l.id));
      if (ids.length === 0) {
        return { ok: true, data: { rows: [], nextCursor: null, hasMore: false } };
      }
      q = q.in('lead_id', ids);
    }
  }

  if ((filters.channels ?? []).length > 0) q = q.in('channel', filters.channels as string[]);

  // Cursor keyset (last_message_at DESC NULLS LAST, id DESC).
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

  const { data, error } = await q
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (error) return { ok: false, error: error.message };

  const allRaw = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = allRaw.length > limit;
  const visibleRaw = hasMore ? allRaw.slice(0, limit) : allRaw;

  let nextCursor: CursorParam | null = null;
  if (hasMore && visibleRaw.length > 0) {
    const last = visibleRaw[visibleRaw.length - 1];
    nextCursor = { lastMessageAt: (last.last_message_at as string | null) ?? null, id: Number(last.id) };
  }

  const leadIds = Array.from(new Set(visibleRaw.map((r) => Number(r.lead_id))));
  const convIds = visibleRaw.map((r) => Number(r.id));
  const [leadsById, labelsByConv] = await Promise.all([
    fetchLeadsByIds(supabase, leadIds),
    fetchLabelsByConvId(supabase, convIds),
  ]);

  const rows = visibleRaw.map((raw) =>
    mapRow(raw, leadsById.get(Number(raw.lead_id)), labelsByConv.get(Number(raw.id)) ?? []),
  );

  const filtered = applyConvFilters(rows, {
    labelIds: filters.labelIds,
    assignee: filters.assignee,
    viewerId: eff.userId,
  });

  return { ok: true, data: { rows: filtered, nextCursor, hasMore } };
}

// ---------------------------------------------------------------------------
// getConversationDetail — conversación + lead + mensajes + notas
// ---------------------------------------------------------------------------

export async function getConversationDetail(
  conversationId: number,
): Promise<ActionResult<ConversationDetail>> {
  if (!isValidId(conversationId)) return { ok: false, error: 'invalid_id' };

  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();
  const { data: convRaw, error: convErr } = await supabase
    .from('conversations')
    .select(CONV_DETAIL_SELECT)
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr) return { ok: false, error: convErr.message };
  if (!convRaw) return { ok: false, error: 'not_found' };

  const leadId = Number((convRaw as Record<string, unknown>).lead_id);

  const [leadsById, labelsByConv, msgsRes, notesRes, outboxRes] = await Promise.all([
    fetchLeadsByIds(supabase, [leadId]),
    fetchLabelsByConvId(supabase, [conversationId]),
    supabase
      .from('conversation_messages')
      .select('id, role, content, content_type, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(500),
    supabase
      .from('conversation_notes')
      .select('id, content, author_email, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('mock_whatsapp_outbox')
      .select('id, parts, status, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200),
  ]);

  const lead = leadsById.get(leadId);
  const conversation = mapRow(
    convRaw as Record<string, unknown>,
    lead,
    labelsByConv.get(conversationId) ?? [],
  );

  const messages: ThreadMessage[] = ((msgsRes.data ?? []) as Array<Record<string, unknown>>).map(
    (m) => ({
      id: Number(m.id),
      role: String(m.role),
      content: String(m.content ?? ''),
      contentType: String(m.content_type ?? 'text'),
      createdAt: String(m.created_at),
    }),
  );

  const notes: ConvNote[] = ((notesRes.data ?? []) as Array<Record<string, unknown>>).map((n) => ({
    id: Number(n.id),
    content: String(n.content),
    authorEmail: (n.author_email as string | null) ?? null,
    createdAt: String(n.created_at),
  }));

  const outbox: OutboxEntry[] = ((outboxRes.data ?? []) as Array<Record<string, unknown>>).map((o) => ({
    id: Number(o.id),
    parts: Array.isArray(o.parts) ? (o.parts as unknown[]).map((p) => String(p)) : [],
    status: String(o.status ?? 'pending'),
    createdAt: String(o.created_at),
  }));

  return {
    ok: true,
    data: {
      conversation,
      leadEmail: lead?.email ?? null,
      handoffCause: ((convRaw as Record<string, unknown>).handoff_cause as string | null) ?? null,
      handoffReason: ((convRaw as Record<string, unknown>).handoff_reason as string | null) ?? null,
      messages,
      notes,
      outbox,
    },
  };
}

// ---------------------------------------------------------------------------
// Toggles de control (pausa IA, handoff, leído, bloqueo)
// ---------------------------------------------------------------------------

export async function togglePauseConversation(input: {
  conversationId: number;
  paused: boolean;
}): Promise<ActionResult> {
  if (!isValidId(input.conversationId)) return { ok: false, error: 'invalid_id' };
  const auth = await authorizeWrite('viewer'); // agent.pause = todos
  if (!auth.ok) return auth;

  const { error } = await auth.supabase
    .from('conversations')
    .update({ ai_paused_until: input.paused ? 'infinity' : null, updated_at: new Date().toISOString() })
    .eq('id', input.conversationId);
  if (error) return { ok: false, error: error.message };

  revalidateConv(input.conversationId);
  return { ok: true };
}

export async function setConversationHandoff(input: {
  conversationId: number;
  on: boolean;
  reason?: string | null;
}): Promise<ActionResult> {
  if (!isValidId(input.conversationId)) return { ok: false, error: 'invalid_id' };
  const auth = await authorizeWrite('viewer'); // agent.handoff = todos
  if (!auth.ok) return auth;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.on) {
    updates.is_handoff_to_human = true;
    updates.handoff_at = new Date().toISOString();
    updates.handoff_reason = input.reason?.trim() || null;
    updates.status = 'handoff';
  } else {
    updates.is_handoff_to_human = false;
    updates.handoff_at = null;
    updates.handoff_cause = null;
    updates.handoff_reason = null;
    updates.status = 'active';
  }

  const { error } = await auth.supabase
    .from('conversations')
    .update(updates)
    .eq('id', input.conversationId);
  if (error) return { ok: false, error: error.message };

  revalidateConv(input.conversationId);
  return { ok: true };
}

export async function setConversationUnread(input: {
  conversationId: number;
  unread: boolean;
}): Promise<ActionResult> {
  if (!isValidId(input.conversationId)) return { ok: false, error: 'invalid_id' };
  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  const { error } = await auth.supabase
    .from('conversations')
    .update({ is_unread: input.unread, updated_at: new Date().toISOString() })
    .eq('id', input.conversationId);
  if (error) return { ok: false, error: error.message };

  revalidateConv(input.conversationId);
  return { ok: true };
}

export async function setConversationBlocked(input: {
  conversationId: number;
  blocked: boolean;
}): Promise<ActionResult> {
  if (!isValidId(input.conversationId)) return { ok: false, error: 'invalid_id' };
  const auth = await authorizeWrite('admin'); // bloquear = director_oficina+
  if (!auth.ok) return auth;

  const updates: Record<string, unknown> = {
    is_blocked: input.blocked,
    updated_at: new Date().toISOString(),
  };
  // Al bloquear, pausar la IA (defensa: no queremos que el agente siga respondiendo).
  if (input.blocked) updates.ai_paused_until = 'infinity';

  const { error } = await auth.supabase
    .from('conversations')
    .update(updates)
    .eq('id', input.conversationId);
  if (error) return { ok: false, error: error.message };

  revalidateConv(input.conversationId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Envío manual del agente humano (composer) — role='human', anon+RLS
// ---------------------------------------------------------------------------

export async function sendManualMessage(input: {
  conversationId: number;
  content: string;
}): Promise<ActionResult<{ id: number }>> {
  if (!isValidId(input.conversationId)) return { ok: false, error: 'invalid_id' };
  const auth = await authorizeWrite('viewer'); // comercial+ pueden responder al lead
  if (!auth.ok) return auth;

  const content = (input.content ?? '').trim();
  if (content.length === 0) return { ok: false, error: 'empty_message' };
  if (content.length > 4000) return { ok: false, error: 'message_too_long' };

  // 1) Mensaje del humano (role='human'). RLS conversation_messages_modify lo permite
  //    (tenant + conversación accesible). NUNCA service-role.
  const { data, error } = await auth.supabase
    .from('conversation_messages')
    .insert({
      conversation_id: input.conversationId,
      tenant_id: auth.eff.tenantId,
      role: 'human',
      content,
      content_type: 'text',
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  // 2) El humano se hizo cargo → pausar la IA + tocar last_message_at.
  const { error: updErr } = await auth.supabase
    .from('conversations')
    .update({
      ai_paused_until: 'infinity',
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.conversationId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidateConv(input.conversationId);
  return { ok: true, data: { id: Number(data.id) } };
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------

export async function addConversationNote(input: {
  conversationId: number;
  content: string;
}): Promise<ActionResult<{ id: number }>> {
  if (!isValidId(input.conversationId)) return { ok: false, error: 'invalid_id' };
  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  const content = (input.content ?? '').trim();
  if (content.length === 0) return { ok: false, error: 'empty_note' };
  if (content.length > 4000) return { ok: false, error: 'note_too_long' };

  const { data, error } = await auth.supabase
    .from('conversation_notes')
    .insert({
      conversation_id: input.conversationId,
      tenant_id: auth.eff.tenantId,
      content,
      author_user_id: auth.eff.userId,
      author_email: auth.eff.email,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  revalidateConv(input.conversationId);
  return { ok: true, data: { id: Number(data.id) } };
}

// ---------------------------------------------------------------------------
// Etiquetas (conversation-scoped) + side-effects
// ---------------------------------------------------------------------------

export async function applyConvLabel(input: {
  conversationId: number;
  labelId: number;
}): Promise<ActionResult> {
  if (!isValidId(input.conversationId) || !isValidId(input.labelId)) {
    return { ok: false, error: 'invalid_id' };
  }
  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const { data: label } = await supabase
    .from('tenant_labels')
    .select('id, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to')
    .eq('id', input.labelId)
    .maybeSingle();
  if (!label) return { ok: false, error: 'invalid_label' };

  const { error: insertErr } = await supabase
    .from('conversation_labels')
    .upsert(
      {
        conversation_id: input.conversationId,
        label_id: input.labelId,
        tenant_id: eff.tenantId,
        applied_by: eff.userId,
        applied_via: 'manual',
      },
      { onConflict: 'conversation_id,label_id', ignoreDuplicates: true },
    );
  if (insertErr) return { ok: false, error: insertErr.message };

  // Side-effects sobre la conversación / lead.
  if (label.pause_ai_on_apply) {
    await supabase
      .from('conversations')
      .update({ ai_paused_until: 'infinity', updated_at: new Date().toISOString() })
      .eq('id', input.conversationId);
  } else if (label.resume_ai_on_apply) {
    await supabase
      .from('conversations')
      .update({ ai_paused_until: null, updated_at: new Date().toISOString() })
      .eq('id', input.conversationId);
  }

  const autoAssignTo = toNumOrNull(label.auto_assign_to);
  if (autoAssignTo !== null) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('lead_id')
      .eq('id', input.conversationId)
      .maybeSingle();
    const leadId = toNumOrNull(conv?.lead_id);
    if (leadId !== null) {
      const { data: leadRow } = await supabase
        .from('leads')
        .select('assigned_to_user_id')
        .eq('id', leadId)
        .maybeSingle();
      if (leadRow && leadRow.assigned_to_user_id == null) {
        await supabase
          .from('leads')
          .update({ assigned_to_user_id: autoAssignTo, updated_at: new Date().toISOString() })
          .eq('id', leadId);
      }
    }
  }

  revalidateConv(input.conversationId);
  return { ok: true };
}

export async function removeConvLabel(input: {
  conversationId: number;
  labelId: number;
}): Promise<ActionResult> {
  if (!isValidId(input.conversationId) || !isValidId(input.labelId)) {
    return { ok: false, error: 'invalid_id' };
  }
  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  const { error } = await auth.supabase
    .from('conversation_labels')
    .delete()
    .eq('conversation_id', input.conversationId)
    .eq('label_id', input.labelId);
  if (error) return { ok: false, error: error.message };

  revalidateConv(input.conversationId);
  return { ok: true };
}

function revalidateConv(conversationId: number): void {
  revalidatePath('/conversations');
  revalidatePath(`/conversations/${conversationId}`);
  revalidatePath('/pipeline');
  revalidatePath('/leads');
}
