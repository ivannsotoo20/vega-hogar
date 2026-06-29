import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { resolveComercial } from '../comercial-resolver.js';
import { calcomCreateBooking } from '../../lib/calcom-client.js';
import { resolveCalcomConfig } from '../calcom-provider.js';

/**
 * `agendar_visita` / `agendar_tasacion` (tool POST-pipeline, escribe `visits`).
 *
 * - Resuelve `comercial_user_id` (round-robin oficina) + re-valida slot (anti doble-booking).
 * - **Cal.com (gated, F10c):** si `CALENDAR_PROVIDER=calcom` y hay nombre+email del lead,
 *   crea la reserva en Cal.com (espejo) y la registra en `calendar_appointments`,
 *   enlazándola a `visits.calendar_appointment_id`. `visits` es la VERDAD; el espejo
 *   Cal.com es **best-effort** (si falla, la visita se crea igual y se loggea).
 */

const VISIT_DURATION_MS = 60 * 60 * 1000;

export interface AgendarVisitaParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  leadId: number;
  slotIso: string;
  isTasation: boolean;
  propertyId?: number | null;
  officeId?: number | null;
  preferredUserId?: number | null;
  /** Para el espejo Cal.com (attendee) — opcionales; sin ellos no se crea el espejo. */
  conversationId?: number | null;
  leadName?: string | null;
  leadEmail?: string | null;
  leadTrackingUuid?: string | null;
}

export type AgendarVisitaResult =
  | { ok: true; visitId: number; comercialUserId: number; calendarAppointmentId: number | null }
  | { ok: false; reason: 'invalid_slot' | 'no_comercial' | 'slot_conflict' | 'insert_failed' };

export async function agendarVisita(params: AgendarVisitaParams): Promise<AgendarVisitaResult> {
  const { supabase, tenantId, leadId, slotIso, isTasation, propertyId, officeId, preferredUserId } = params;

  // 1. Validar slot.
  const slotMs = Date.parse(slotIso);
  if (!Number.isFinite(slotMs)) return { ok: false, reason: 'invalid_slot' };
  const scheduledFor = new Date(slotMs).toISOString();

  // 2. Resolver comercial.
  const comercialUserId = await resolveComercial({ supabase, tenantId, officeId, preferredUserId });
  if (!comercialUserId) return { ok: false, reason: 'no_comercial' };

  // 3. Re-validar slot (anti doble-booking del mismo comercial a la misma hora).
  const { data: clash } = await supabase
    .from('visits')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('comercial_user_id', comercialUserId)
    .eq('scheduled_for', scheduledFor)
    .eq('status', 'scheduled')
    .maybeSingle();
  if (clash) return { ok: false, reason: 'slot_conflict' };

  // 4. Espejo Cal.com (gated + best-effort).
  const calendarAppointmentId = await maybeCreateCalcomMirror({ ...params, scheduledFor });

  // 5. INSERT visits (verdad).
  const row: Database['public']['Tables']['visits']['Insert'] = {
    tenant_id: tenantId,
    lead_id: leadId,
    comercial_user_id: comercialUserId,
    scheduled_for: scheduledFor,
    status: 'scheduled',
    is_tasation: isTasation,
    property_id: isTasation ? null : (propertyId ?? null),
    calendar_appointment_id: calendarAppointmentId,
  };
  const { data, error } = await supabase.from('visits').insert(row).select('id').single();
  if (error || !data) {
    logger.warn({ err: error?.message, leadId }, '[agendar-visita] insert failed');
    return { ok: false, reason: 'insert_failed' };
  }
  return { ok: true, visitId: Number(data.id), comercialUserId, calendarAppointmentId };
}

async function maybeCreateCalcomMirror(
  args: AgendarVisitaParams & { scheduledFor: string },
): Promise<number | null> {
  const { supabase, tenantId, leadId, conversationId, leadName, leadEmail, leadTrackingUuid, scheduledFor } = args;
  if (env.CALENDAR_PROVIDER !== 'calcom') return null;
  if (!leadName || !leadEmail) {
    logger.warn({ tenantId, leadId }, '[agendar-visita] Cal.com: faltan nombre/email del lead → sin espejo');
    return null;
  }
  try {
    const cfg = await resolveCalcomConfig(supabase, tenantId);
    if (!cfg) return null;
    const booking = await calcomCreateBooking({
      apiKey: cfg.apiKey,
      eventTypeId: cfg.eventTypeId,
      startIso: scheduledFor,
      attendee: { name: leadName, email: leadEmail, timeZone: 'Europe/Madrid' },
      metadata: leadTrackingUuid ? { vega_lead_uuid: leadTrackingUuid } : undefined,
      baseUrl: cfg.baseUrl,
    });
    const endIso = new Date(Date.parse(scheduledFor) + VISIT_DURATION_MS).toISOString();
    const { data: appt, error } = await supabase
      .from('calendar_appointments')
      .insert({
        tenant_id: tenantId,
        calendar_account_id: cfg.calendarAccountId,
        external_appointment_id: booking.uid,
        lead_id: leadId,
        conversation_id: conversationId ?? null,
        start_at: scheduledFor,
        end_at: endIso,
        appointment_status: booking.status,
        source: 'fyzon-api-booking',
        match_method: 'api_booking',
        match_confidence: 100,
      })
      .select('id')
      .single();
    if (error) {
      logger.warn({ err: error.message, tenantId }, '[agendar-visita] Cal.com espejo: insert calendar_appointments falló');
      return null;
    }
    return appt ? Number(appt.id) : null;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), tenantId, leadId },
      '[agendar-visita] Cal.com espejo falló (la visita se crea igual)',
    );
    return null;
  }
}
