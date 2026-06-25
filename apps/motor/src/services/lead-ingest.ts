import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { computeTrackingUuid } from '../lib/tracking-uuid.js';
import { logger } from '../lib/logger.js';

/**
 * Ingesta de leads inbound — REESCRITO para Vega (sin tabla `channels`).
 *
 * Diferencias clave vs SETTER:
 *  - Vega NO tiene tabla `channels`: el canal es un enum `channel` en `leads` y
 *    `conversations`. El lead es único por `(tenant_id, phone)`.
 *  - Mensajes: columna `role` (enum message_role) en vez de `source`.
 *
 * Funciones puras de BD (sin lógica de negocio); las consume el webhook (S15).
 */

type ChannelType = Database['public']['Enums']['channel_type'];
type LeadIntent = Database['public']['Enums']['lead_intent'];
type MessageContentType = Database['public']['Enums']['message_content_type'];

export interface ResolveTenantResult {
  tenantId: number;
  tokenId: number;
}

/**
 * Resuelve el tenant a partir de un `tenant_token` activo y no revocado.
 * Si `expectedPurpose` se pasa, exige que coincida. Devuelve null si no resuelve.
 */
export async function resolveTenantByToken(
  supabase: SupabaseClient<Database>,
  token: string,
  expectedPurpose?: string,
): Promise<ResolveTenantResult | null> {
  if (!token || token.trim() === '') return null;
  const { data, error } = await supabase
    .from('tenant_tokens')
    .select('id, tenant_id, purpose, is_active, revoked_at')
    .eq('token', token)
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) {
    logger.warn({ err: error.message }, '[lead-ingest] resolveTenantByToken query failed');
    return null;
  }
  if (!data) return null;
  if (expectedPurpose && String(data.purpose) !== expectedPurpose) return null;
  return { tenantId: Number(data.tenant_id), tokenId: Number(data.id) };
}

export interface UpsertLeadParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  phone: string;
  channel: ChannelType;
  fullName?: string | null;
  externalId?: string | null;
  intent?: LeadIntent;
}

/**
 * Upsert de lead por `(tenant_id, phone)` (clave única). Si existe, sólo rellena
 * `full_name`/`external_id` que estuvieran vacíos (no pisa datos). Si es nuevo,
 * inserta y backfillea `tracking_uuid` (best-effort, requiere la key de cifrado).
 */
export async function upsertLead(
  params: UpsertLeadParams,
): Promise<{ leadId: number; created: boolean }> {
  const { supabase, tenantId, phone, channel, fullName, externalId, intent } = params;

  const { data: existing, error: selErr } = await supabase
    .from('leads')
    .select('id, full_name, external_id')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .maybeSingle();
  if (selErr) throw new Error(`upsertLead: select failed: ${selErr.message}`);

  if (existing) {
    const patch: Database['public']['Tables']['leads']['Update'] = {};
    if (fullName && !existing.full_name) patch.full_name = fullName;
    if (externalId && !existing.external_id) patch.external_id = externalId;
    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase
        .from('leads')
        .update(patch)
        .eq('id', Number(existing.id))
        .eq('tenant_id', tenantId);
      if (updErr) logger.warn({ err: updErr.message }, '[lead-ingest] upsertLead patch failed (non-fatal)');
    }
    return { leadId: Number(existing.id), created: false };
  }

  const insertRow: Database['public']['Tables']['leads']['Insert'] = {
    tenant_id: tenantId,
    phone,
    channel,
    full_name: fullName ?? null,
    external_id: externalId ?? null,
    intent: intent ?? 'unknown',
    status: 'new',
  };
  const { data: inserted, error: insErr } = await supabase
    .from('leads')
    .insert(insertRow)
    .select('id')
    .single();
  if (insErr || !inserted) throw new Error(`upsertLead: insert failed: ${insErr?.message}`);
  const leadId = Number(inserted.id);

  // Backfill tracking_uuid (best-effort; derivado del id, requiere key de cifrado).
  try {
    const trackingUuid = computeTrackingUuid(leadId);
    await supabase.from('leads').update({ tracking_uuid: trackingUuid }).eq('id', leadId);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[lead-ingest] tracking_uuid backfill skipped');
  }

  return { leadId, created: true };
}

export interface GetOrCreateConversationParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  leadId: number;
  channel: ChannelType;
  conversationSource?: string | null;
}

/**
 * Reusa la conversación más reciente del lead si no está descalificada; si no,
 * crea una nueva (`status='active'`, `direction='inbound'`, `current_phase=0`).
 */
export async function getOrCreateConversation(
  params: GetOrCreateConversationParams,
): Promise<{ conversationId: number; created: boolean }> {
  const { supabase, tenantId, leadId, channel, conversationSource } = params;

  const { data: existing, error: selErr } = await supabase
    .from('conversations')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selErr) throw new Error(`getOrCreateConversation: select failed: ${selErr.message}`);

  if (existing && existing.status !== 'disqualified') {
    return { conversationId: Number(existing.id), created: false };
  }

  const insertRow: Database['public']['Tables']['conversations']['Insert'] = {
    tenant_id: tenantId,
    lead_id: leadId,
    channel,
    status: 'active',
    direction: 'inbound',
    current_phase: 0,
    conversation_source: conversationSource ?? null,
  };
  const { data: inserted, error: insErr } = await supabase
    .from('conversations')
    .insert(insertRow)
    .select('id')
    .single();
  if (insErr || !inserted) throw new Error(`getOrCreateConversation: insert failed: ${insErr?.message}`);
  return { conversationId: Number(inserted.id), created: true };
}

export interface InsertInboundMessageParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  conversationId: number;
  content: string;
  contentType?: MessageContentType;
  externalMsgId?: string | null;
}

/** Inserta el mensaje inbound (`role='lead'`) y actualiza `last_message_at`. */
export async function insertInboundMessage(
  params: InsertInboundMessageParams,
): Promise<{ messageId: number }> {
  const { supabase, tenantId, conversationId, content, contentType, externalMsgId } = params;
  const { data, error } = await supabase
    .from('conversation_messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      role: 'lead',
      content,
      content_type: contentType ?? 'text',
      external_msg_id: externalMsgId ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`insertInboundMessage: insert failed: ${error?.message}`);

  const { error: updErr } = await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (updErr) logger.warn({ err: updErr.message }, '[lead-ingest] last_message_at update failed (non-fatal)');

  return { messageId: Number(data.id) };
}
