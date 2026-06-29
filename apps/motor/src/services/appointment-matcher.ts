import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';

/**
 * Matchea el lead + conversación que originó un booking de Cal.com (webhook).
 * Orden de prioridad (re-domain de SETTER, sin GHL):
 *   1. metadata.vega_lead_uuid → `leads.tracking_uuid` (confianza 100).
 *   2. email del attendee → `leads.email` (confianza 90).
 * Si nada matchea → unmatched (confianza 0); el applier solo registra el espejo.
 */

export interface CalcomBooking {
  uid: string;
  startTime: string;
  endTime: string;
  status: string;
  title?: string | null;
  attendees: Array<{ name?: string; email?: string; timeZone?: string }>;
  metadata?: Record<string, unknown> | null;
}

export type MatchMethod = 'tracking_uuid' | 'email' | 'unmatched';

export interface MatchResult {
  leadId: number | null;
  conversationId: number | null;
  method: MatchMethod;
  confidence: number;
}

const UNMATCHED: MatchResult = { leadId: null, conversationId: null, method: 'unmatched', confidence: 0 };

export async function matchLeadFromCalcom(args: {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  booking: CalcomBooking;
}): Promise<MatchResult> {
  const { supabase, tenantId, booking } = args;

  // 1. tracking_uuid en metadata.
  const uuid = booking.metadata && typeof booking.metadata.vega_lead_uuid === 'string'
    ? (booking.metadata.vega_lead_uuid as string)
    : null;
  if (uuid) {
    const lead = await findLead(supabase, tenantId, 'tracking_uuid', uuid);
    if (lead) return await withConversation(supabase, tenantId, lead, 'tracking_uuid', 100);
  }

  // 2. email del attendee.
  const email = booking.attendees.find((a) => a.email)?.email?.trim().toLowerCase() ?? null;
  if (email) {
    const lead = await findLead(supabase, tenantId, 'email', email);
    if (lead) return await withConversation(supabase, tenantId, lead, 'email', 90);
  }

  return UNMATCHED;
}

async function findLead(
  supabase: SupabaseClient<Database>,
  tenantId: number,
  col: 'tracking_uuid' | 'email',
  val: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq(col, val)
    .limit(1)
    .maybeSingle();
  return data ? Number(data.id) : null;
}

async function withConversation(
  supabase: SupabaseClient<Database>,
  tenantId: number,
  leadId: number,
  method: MatchMethod,
  confidence: number,
): Promise<MatchResult> {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { leadId, conversationId: data ? Number(data.id) : null, method, confidence };
}
