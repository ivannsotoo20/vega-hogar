import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@vega-hogar/db';
import type { GeneratorUsage, InmobiliarioToolOutput } from './types.js';

/** Rol técnico de la llamada (enum `llm_role`). */
type LlmRole = Database['public']['Enums']['llm_role'];
/** Estado de la llamada (enum `llm_call_status`). */
type LlmCallStatus = Database['public']['Enums']['llm_call_status'];

interface LogLlmCallParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  conversationId: number | null;
  role: LlmRole;
  model: string;
  status: LlmCallStatus;
  usage: Partial<GeneratorUsage>;
  /** Opcional. Solo para errores. */
  errorMessage?: string;
  /** Resumen del prompt enviado (no guardamos texto completo). */
  requestPayload: Json;
  /** Resumen de la respuesta. */
  responsePayload: Json;
}

/**
 * Inserta una fila en `llm_calls`. Si falla, log warning pero NO propaga.
 * Devuelve el id generado o null si la inserción falló.
 *
 * Las columnas coinciden 1:1 con el esquema Vega (`llm_calls.Insert`); el
 * cliente tipado `SupabaseClient<Database>` valida el shape en compile-time.
 */
export async function logLlmCall(params: LogLlmCallParams): Promise<number | null> {
  const {
    supabase,
    tenantId,
    conversationId,
    role,
    model,
    status,
    usage,
    errorMessage,
    requestPayload,
    responsePayload,
  } = params;

  const tokensIn =
    (usage.tokensInUncached ?? 0) +
    (usage.tokensInCacheRead ?? 0) +
    (usage.tokensInCacheWrite ?? 0);

  const row: Database['public']['Tables']['llm_calls']['Insert'] = {
    tenant_id: tenantId,
    conversation_id: conversationId,
    provider: 'anthropic',
    model,
    role,
    status,
    tokens_in: tokensIn || null,
    tokens_in_cached: usage.tokensInCacheRead ?? null,
    tokens_out: usage.tokensOut ?? null,
    cost: usage.costUsd ?? null,
    latency_ms: usage.latencyMs ?? null,
    error_message: errorMessage ?? null,
    request_payload: requestPayload,
    response_payload: responsePayload,
  };

  const { data, error } = await supabase
    .from('llm_calls')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[llm-call-log] insert failed (non-fatal):', error.message);
    return null;
  }
  return data ? Number(data.id) : null;
}

/** Resumen seguro del output del agente para guardar en response_payload. */
export function summarizeInmobiliarioOutput(
  out: InmobiliarioToolOutput,
): Record<string, Json | undefined> {
  return {
    message_raw_chars: out.message_raw.length,
    message_raw_preview: out.message_raw.slice(0, 200),
    user_summary: out.user_summary,
    conversation_status: out.conversation_status,
    phase_decision: out.phase_decision,
    detected_intent: out.detected_intent,
    proposed_property_ids: out.proposed_property_ids,
    proposed_visit_slot: out.proposed_visit_slot,
    is_tasation_visit: out.is_tasation_visit,
    contraoferta_registrada: out.contraoferta_registrada,
    resources_to_send: out.resources_to_send,
    handoff_cause: out.handoff_cause,
    handoff_reason: out.handoff_reason,
    reasoning: out.reasoning,
  };
}
