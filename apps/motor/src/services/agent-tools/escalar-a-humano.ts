import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { resolveComercial } from '../comercial-resolver.js';
import { logger } from '../../lib/logger.js';

/**
 * `escalar_a_humano` (tool POST-pipeline). Marca la conversación como handoff:
 * `is_handoff_to_human=true`, `handoff_cause/reason/at`, pausa la IA
 * (`ai_paused_until='infinity'`) y asigna el comercial destino (round-robin).
 *
 * Hace su propio UPDATE (columnas de handoff) — el UPDATE principal de
 * `process-debounced` sólo toca status/fase/razonamiento, sin solaparse.
 */

type HandoffCause = Database['public']['Enums']['handoff_cause'];

export interface EscalarAHumanoParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  conversationId: number;
  handoffCause?: HandoffCause | null;
  handoffReason?: string | null;
  officeId?: number | null;
  preferredUserId?: number | null;
}

export async function escalarAHumano(
  params: EscalarAHumanoParams,
): Promise<{ comercialUserId: number | null }> {
  const { supabase, tenantId, conversationId, handoffCause, handoffReason, officeId, preferredUserId } = params;

  const comercialUserId = await resolveComercial({ supabase, tenantId, officeId, preferredUserId });

  const patch: Database['public']['Tables']['conversations']['Update'] = {
    is_handoff_to_human: true,
    handoff_cause: handoffCause ?? null,
    handoff_reason: handoffReason ?? null,
    handoff_at: new Date().toISOString(),
    ai_paused_until: 'infinity',
  };
  if (comercialUserId) patch.assigned_user_id = comercialUserId;

  const { error } = await supabase
    .from('conversations')
    .update(patch)
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);
  if (error) {
    logger.warn({ err: error.message, conversationId }, '[escalar-a-humano] update failed (non-fatal)');
  }

  return { comercialUserId };
}
