import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { logger } from '../lib/logger.js';
import type { CalcomBooking, MatchResult } from './appointment-matcher.js';

/**
 * Aplica un evento de booking de Cal.com (webhook) a la conversación + registra el
 * espejo en `calendar_appointments`. Re-domain del applier de SETTER (agnóstico de
 * provider), mapeado a columnas Vega.
 *
 * - **created/confirmed** + conversación matcheada → `appointment_scheduled_at`,
 *   handoff `A_agenda`, pausa IA (un humano lleva la visita). + `pipeline_events`.
 * - **cancelled** → revoca el handoff `A_agenda` (reactiva IA, status active).
 * - Siempre UPSERT del espejo `calendar_appointments` (idempotente por uid).
 */

export type CalcomEventType = 'created' | 'cancelled' | 'rescheduled';

export interface ApplyResult {
  appliedAppointmentId: number | null;
  conversationMoved: boolean;
  revoked: boolean;
}

export async function applyCalcomAppointment(args: {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  calendarAccountId: number;
  booking: CalcomBooking;
  eventType: CalcomEventType;
  match: MatchResult;
}): Promise<ApplyResult> {
  const { supabase, tenantId, calendarAccountId, booking, eventType, match } = args;
  const result: ApplyResult = { appliedAppointmentId: null, conversationMoved: false, revoked: false };

  const status = eventType === 'cancelled' ? 'cancelled' : booking.status || 'confirmed';

  // 1. UPSERT espejo calendar_appointments (idempotente por (tenant, external_appointment_id)).
  const { data: existing } = await supabase
    .from('calendar_appointments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('external_appointment_id', booking.uid)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('calendar_appointments')
      .update({ appointment_status: status, start_at: booking.startTime, end_at: booking.endTime, updated_at: new Date().toISOString() })
      .eq('id', Number(existing.id));
    result.appliedAppointmentId = Number(existing.id);
  } else {
    const { data: ins, error } = await supabase
      .from('calendar_appointments')
      .insert({
        tenant_id: tenantId,
        calendar_account_id: calendarAccountId,
        external_appointment_id: booking.uid,
        lead_id: match.leadId,
        conversation_id: match.conversationId,
        title: booking.title ?? null,
        start_at: booking.startTime,
        end_at: booking.endTime,
        appointment_status: status,
        source: 'webhook',
        match_method: match.method,
        match_confidence: match.confidence,
      })
      .select('id')
      .single();
    if (error) logger.warn({ err: error.message, tenantId }, '[applier] insert calendar_appointments falló');
    result.appliedAppointmentId = ins ? Number(ins.id) : null;
  }

  // 2. Efecto en la conversación (solo si hay match).
  if (!match.conversationId) return result;
  const convId = match.conversationId;

  if (eventType === 'created' || eventType === 'rescheduled') {
    const { error } = await supabase
      .from('conversations')
      .update({
        appointment_scheduled_at: booking.startTime,
        is_handoff_to_human: true,
        handoff_cause: 'A_agenda',
        handoff_at: new Date().toISOString(),
        status: 'handoff',
        ai_paused_until: 'infinity',
        updated_at: new Date().toISOString(),
      })
      .eq('id', convId)
      .eq('tenant_id', tenantId);
    if (!error) {
      result.conversationMoved = true;
      await emitEvent(supabase, tenantId, convId, 'appointment_created', booking.uid);
    }
  } else if (eventType === 'cancelled') {
    // Revoca el handoff por agenda si lo había.
    const { data: conv } = await supabase
      .from('conversations')
      .select('handoff_cause')
      .eq('id', convId)
      .maybeSingle();
    if (conv?.handoff_cause === 'A_agenda') {
      const { error } = await supabase
        .from('conversations')
        .update({
          appointment_scheduled_at: null,
          is_handoff_to_human: false,
          handoff_cause: null,
          handoff_at: null,
          status: 'active',
          ai_paused_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', convId)
        .eq('tenant_id', tenantId);
      if (!error) {
        result.revoked = true;
        await emitEvent(supabase, tenantId, convId, 'appointment_cancelled', booking.uid);
      }
    }
  }

  return result;
}

async function emitEvent(
  supabase: SupabaseClient<Database>,
  tenantId: number,
  conversationId: number,
  eventType: string,
  uid: string,
): Promise<void> {
  const { error } = await supabase.from('pipeline_events').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    event_type: eventType,
    from_value: null,
    to_value: uid,
    source: 'calcom_webhook',
  });
  if (error) logger.warn({ err: error.message, conversationId }, '[applier] pipeline_events insert falló');
}
