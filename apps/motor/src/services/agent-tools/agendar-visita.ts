import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { resolveComercial } from '../comercial-resolver.js';
import { logger } from '../../lib/logger.js';

/**
 * `agendar_visita` / `agendar_tasacion` (tool POST-pipeline, escribe `visits`).
 *
 * - Resuelve `comercial_user_id` (round-robin oficina; prioriza el asignado al
 *   inmueble/lead).
 * - Re-valida el slot (mitiga doble-booking: no dos visitas `scheduled` del mismo
 *   comercial a la misma hora).
 * - INSERT `visits` (`is_tasation` distingue tasación de visita; `property_id` es
 *   null en tasación).
 *
 * En F10b el booking solo escribe `visits` (mock). El espejo Cal.com llega en F10c.
 */

export interface AgendarVisitaParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  leadId: number;
  slotIso: string;
  isTasation: boolean;
  /** Inmueble de la visita (comprador). Null/omitir en tasación. */
  propertyId?: number | null;
  officeId?: number | null;
  /** Comercial preferente (p.ej. `properties.assigned_to_user_id`). */
  preferredUserId?: number | null;
}

export type AgendarVisitaResult =
  | { ok: true; visitId: number; comercialUserId: number }
  | { ok: false; reason: 'invalid_slot' | 'no_comercial' | 'slot_conflict' | 'insert_failed' };

export async function agendarVisita(params: AgendarVisitaParams): Promise<AgendarVisitaResult> {
  const { supabase, tenantId, leadId, slotIso, isTasation, propertyId, officeId, preferredUserId } = params;

  // 1. Validar el slot (ISO 8601 parseable y futuro).
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

  // 4. INSERT visits.
  const row: Database['public']['Tables']['visits']['Insert'] = {
    tenant_id: tenantId,
    lead_id: leadId,
    comercial_user_id: comercialUserId,
    scheduled_for: scheduledFor,
    status: 'scheduled',
    is_tasation: isTasation,
    property_id: isTasation ? null : (propertyId ?? null),
  };
  const { data, error } = await supabase.from('visits').insert(row).select('id').single();
  if (error || !data) {
    logger.warn({ err: error?.message, leadId }, '[agendar-visita] insert failed');
    return { ok: false, reason: 'insert_failed' };
  }
  return { ok: true, visitId: Number(data.id), comercialUserId };
}
