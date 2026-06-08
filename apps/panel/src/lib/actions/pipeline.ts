'use server';

/**
 * F6 / S4 — Server Actions del kanban `/pipeline` (dual comprador/vendedor).
 *
 * Decisión Iván (Q1): **Fases + outcomes**. Las columnas de fase F0–F7 son
 * arrastrables → actualizan `conversations.current_phase` y registran histórico
 * en `pipeline_events` (policy `pipeline_events_manual_insert`, source='manual').
 * Las 5 columnas terminales (outcomes) aplican la system label de ese
 * `destination_bucket` (reusa el patrón de etiquetas), con exclusión mutua.
 *
 * anon + RLS siempre (NUNCA service-role). El gate `pipeline.move` = todos los
 * roles; la RLS escopa la visibilidad (comercial → solo sus leads).
 */

import { revalidatePath } from 'next/cache';

import type { EffectiveTenant } from '@/lib/auth/effective-tenant';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import type { SetterRole } from '@/lib/auth/require-tenant-role';
import { AuthError, requireTenantRoleAtLeast } from '@/lib/auth/require-tenant-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DestinationBucket, LeadIntent, LeadListLabel } from '@/lib/lead-list-query';
import {
  columnsForTrack,
  isOutcomeKey,
  OUTCOME_BUCKETS,
  phaseKey,
  trackForIntent,
  type ColumnKey,
  type OutcomeBucket,
  type PipelineTrack,
} from '@/lib/pipeline-constants';

const BOARD_CAP = 500;

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface PipelineCard {
  id: number; // conversationId
  leadId: number;
  leadName: string | null;
  intent: LeadIntent;
  channel: string;
  phaseNumber: number;
  aiPausedUntil: string | null;
  lastMessageAt: string | null;
  assignedUserId: number | null;
  labels: LeadListLabel[];
}

export interface PipelineBoardResult {
  columns: Record<ColumnKey, PipelineCard[]>;
  total: number;
  truncated: boolean;
}

const CONV_SELECT = 'id, lead_id, channel, current_phase, ai_paused_until, last_message_at';

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface LeadMeta {
  full_name: string | null;
  intent: LeadIntent;
  assigned_to_user_id: number | null;
}

async function fetchLeadsByIds(supabase: ServerClient, leadIds: number[]): Promise<Map<number, LeadMeta>> {
  const map = new Map<number, LeadMeta>();
  if (leadIds.length === 0) return map;
  const { data } = await supabase
    .from('leads')
    .select('id, full_name, intent, assigned_to_user_id')
    .in('id', leadIds);
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    map.set(Number(r.id), {
      full_name: (r.full_name as string | null) ?? null,
      intent: String(r.intent ?? 'unknown') as LeadIntent,
      assigned_to_user_id: toNumOrNull(r.assigned_to_user_id),
    });
  }
  return map;
}

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
// listPipelineBoard — reparte las conversaciones del track en columnas
// ---------------------------------------------------------------------------

export async function listPipelineBoard(input: {
  track: PipelineTrack;
}): Promise<ActionResult<PipelineBoardResult>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('conversations')
    .select(CONV_SELECT)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(BOARD_CAP + 1);
  if (error) return { ok: false, error: error.message };

  const allRaw = (data ?? []) as Array<Record<string, unknown>>;
  const truncated = allRaw.length > BOARD_CAP;
  const rows = truncated ? allRaw.slice(0, BOARD_CAP) : allRaw;
  if (truncated) {
    console.warn(`[pipeline] board truncado a ${BOARD_CAP} conversaciones (hay más).`);
  }

  const leadIds = Array.from(new Set(rows.map((r) => Number(r.lead_id))));
  const convIds = rows.map((r) => Number(r.id));
  const [leadsById, labelsByConv] = await Promise.all([
    fetchLeadsByIds(supabase, leadIds),
    fetchLabelsByConvId(supabase, convIds),
  ]);

  const columns = {} as Record<ColumnKey, PipelineCard[]>;
  for (const key of columnsForTrack(input.track)) columns[key] = [];

  let total = 0;
  for (const raw of rows) {
    const leadId = Number(raw.lead_id);
    const lead = leadsById.get(leadId);
    const intent = lead?.intent ?? 'unknown';
    if (trackForIntent(intent) !== input.track) continue;

    const labels = labelsByConv.get(Number(raw.id)) ?? [];
    const outcome = labels.find(
      (l) => l.destination_bucket != null && isOutcomeKey(l.destination_bucket),
    );
    const phaseNumber = Number(raw.current_phase ?? 0);
    const col: ColumnKey = outcome
      ? (outcome.destination_bucket as OutcomeBucket)
      : phaseKey(phaseNumber);

    const card: PipelineCard = {
      id: Number(raw.id),
      leadId,
      leadName: lead?.full_name ?? null,
      intent,
      channel: String(raw.channel),
      phaseNumber,
      aiPausedUntil: (raw.ai_paused_until as string | null) ?? null,
      lastMessageAt: (raw.last_message_at as string | null) ?? null,
      assignedUserId: lead?.assigned_to_user_id ?? null,
      labels,
    };
    (columns[col] ??= []).push(card);
    total++;
  }

  return { ok: true, data: { columns, total, truncated } };
}

// ---------------------------------------------------------------------------
// movePhase — UPDATE current_phase + INSERT pipeline_events (histórico)
// ---------------------------------------------------------------------------

export async function movePhase(input: {
  conversationId: number;
  toPhase: number;
}): Promise<ActionResult> {
  if (!isValidId(input.conversationId)) return { ok: false, error: 'invalid_id' };
  if (!Number.isInteger(input.toPhase) || input.toPhase < 0 || input.toPhase > 7) {
    return { ok: false, error: 'invalid_phase' };
  }

  const auth = await authorizeWrite('viewer'); // pipeline.move = todos; RLS escopa
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const { data: conv, error: readErr } = await supabase
    .from('conversations')
    .select('current_phase')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!conv) return { ok: false, error: 'not_found' };

  const fromPhase = Number((conv as { current_phase: unknown }).current_phase ?? 0);
  if (fromPhase === input.toPhase) return { ok: true };

  const { error: upErr } = await supabase
    .from('conversations')
    .update({ current_phase: input.toPhase, updated_at: new Date().toISOString() })
    .eq('id', input.conversationId);
  if (upErr) return { ok: false, error: upErr.message };

  // Histórico de funnel (best-effort: si fallara la policy no rompe el movimiento).
  const { error: evErr } = await supabase.from('pipeline_events').insert({
    tenant_id: eff.tenantId,
    conversation_id: input.conversationId,
    event_type: 'phase_change',
    from_value: String(fromPhase),
    to_value: String(input.toPhase),
    source: 'manual',
  });
  if (evErr) console.warn('[pipeline] pipeline_events insert falló:', evErr.message);

  revalidateBoard(input.conversationId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// applyOutcome / removeOutcome — etiquetas terminales (exclusión mutua)
// ---------------------------------------------------------------------------

export async function applyOutcome(input: {
  conversationId: number;
  bucket: OutcomeBucket;
}): Promise<ActionResult> {
  if (!isValidId(input.conversationId)) return { ok: false, error: 'invalid_id' };
  if (!(OUTCOME_BUCKETS as string[]).includes(input.bucket)) {
    return { ok: false, error: 'invalid_bucket' };
  }

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const { data: conv } = await supabase
    .from('conversations')
    .select('lead_id')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'not_found' };

  // System labels de ese bucket (puede haber 2 para 'bought': Comprado/Alquilado).
  const { data: cands } = await supabase
    .from('tenant_labels')
    .select('id, name')
    .eq('destination_bucket', input.bucket);
  const candidates = (cands ?? []) as Array<{ id: number; name: string }>;
  if (candidates.length === 0) {
    return { ok: false, error: `sin etiqueta de sistema para «${input.bucket}»` };
  }

  let target = candidates[0];
  if (input.bucket === 'bought' && candidates.length > 1) {
    const { data: lead } = await supabase
      .from('leads')
      .select('intent')
      .eq('id', Number((conv as { lead_id: number }).lead_id))
      .maybeSingle();
    const intent = String((lead as { intent?: unknown })?.intent ?? '');
    const wantRent = intent === 'tenant' || intent === 'landlord';
    target =
      candidates.find((c) => (wantRent ? /alquil/i.test(c.name) : /comprad/i.test(c.name))) ??
      candidates[0];
  }

  // Exclusión mutua: quitar cualquier otra outcome label de esta conversación.
  const { data: outcomeLabels } = await supabase
    .from('tenant_labels')
    .select('id')
    .in('destination_bucket', OUTCOME_BUCKETS as string[]);
  const outcomeIds = ((outcomeLabels ?? []) as Array<{ id: number }>).map((l) => Number(l.id));
  if (outcomeIds.length > 0) {
    await supabase
      .from('conversation_labels')
      .delete()
      .eq('conversation_id', input.conversationId)
      .in('label_id', outcomeIds);
  }

  const { error } = await supabase.from('conversation_labels').upsert(
    {
      conversation_id: input.conversationId,
      label_id: target.id,
      tenant_id: eff.tenantId,
      applied_by: eff.userId,
      applied_via: 'manual',
    },
    { onConflict: 'conversation_id,label_id', ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };

  revalidateBoard(input.conversationId);
  return { ok: true };
}

export async function removeOutcome(input: { conversationId: number }): Promise<ActionResult> {
  if (!isValidId(input.conversationId)) return { ok: false, error: 'invalid_id' };

  const auth = await authorizeWrite('viewer');
  if (!auth.ok) return auth;

  const { data: outcomeLabels } = await auth.supabase
    .from('tenant_labels')
    .select('id')
    .in('destination_bucket', OUTCOME_BUCKETS as string[]);
  const outcomeIds = ((outcomeLabels ?? []) as Array<{ id: number }>).map((l) => Number(l.id));
  if (outcomeIds.length > 0) {
    const { error } = await auth.supabase
      .from('conversation_labels')
      .delete()
      .eq('conversation_id', input.conversationId)
      .in('label_id', outcomeIds);
    if (error) return { ok: false, error: error.message };
  }

  revalidateBoard(input.conversationId);
  return { ok: true };
}

function revalidateBoard(conversationId: number): void {
  revalidatePath('/pipeline');
  revalidatePath('/conversations');
  revalidatePath(`/conversations/${conversationId}`);
  revalidatePath('/leads');
}
