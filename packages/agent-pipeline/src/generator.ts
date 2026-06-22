import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@vega-hogar/db';
import { composePrompt } from '@vega-hogar/prompt-composer';
import { calculateCostUsd } from './cost.js';
import { logLlmCall, summarizeInmobiliarioOutput } from './llm-call-log.js';
import {
  buildRespondAsInmobiliarioTool,
  RESPOND_AS_INMOBILIARIO_TOOL_NAME,
} from './tool-definition.js';
import type { GeneratorInput, GeneratorOutput, InmobiliarioToolOutput } from './types.js';

/**
 * Modelo default del Generator. Haiku 4.5 (decisión de stack Vega: Haiku 4.5
 * default, Sonnet 4.6 para tareas complejas). En el motor el modelo efectivo se
 * carga de `llm_configs` (role=generator) y se pasa por `input.model`; este
 * default cubre tests/dev. Override por env si hiciera falta.
 */
export const DEFAULT_GENERATOR_MODEL = 'claude-haiku-4-5';
const DEFAULT_MAX_TOKENS = 1024;
/** TTL del cache_control que el composer emite. Sincronizado con `cacheTtl` default del builder. */
const CACHE_TTL: '1h' = '1h';

interface RunGeneratorDeps {
  supabase: SupabaseClient<Database>;
  anthropic: Anthropic;
}

/**
 * Ejecuta el Generator: compone el system prompt (BD = fuente de verdad, Regla 9)
 * con cache two-point + `dynamic_context` fuera de cache (Opción A / RAG), llama a
 * Anthropic con `tool_choice` forzado a `respond_as_inmobiliario`, parsea la
 * respuesta y registra la llamada en `llm_calls`.
 *
 * Errores que propaga:
 *  - Anthropic API error (network, rate limit, 5xx).
 *  - El modelo no usó la tool requerida.
 *  - El JSON del tool_use no cumple el shape mínimo.
 *
 * No propaga: errores al insertar en llm_calls (best-effort, log warning).
 */
export async function runGenerator(
  deps: RunGeneratorDeps,
  input: GeneratorInput,
): Promise<GeneratorOutput> {
  const { supabase, anthropic } = deps;
  const model = input.model ?? DEFAULT_GENERATOR_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  // Cap del tenant propagado a la tool: limita `message_raw.maxLength` a
  // `maxParts × 280 + 30` chars. Si el modelo intenta pasarse, Anthropic rechaza
  // el tool_use por schema validation.
  const aiMessagesPerTurnMax: 1 | 2 | 3 | 4 = input.aiMessagesPerTurnMax ?? 4;
  const respondTool = buildRespondAsInmobiliarioTool({ maxParts: aiMessagesPerTurnMax });

  // 1. Compose system prompt (Cerebro inmobiliario, cargado desde Supabase con
  //    cache_control). API NUEVA del prompt-composer de Vega: lo dinámico
  //    (inmuebles/slots/fecha/intención/contacto) va en `dynamicContext` y se
  //    renderiza en el bloque sintético `dynamic_context` FUERA de cache.
  const composed = await composePrompt(supabase, {
    tenantId: input.tenantId,
    currentPhase: input.currentPhase,
    currentPhaseFocus: input.currentPhaseFocus,
    cacheStrategy: input.cacheStrategy,
    cacheTtl: input.cacheTtl,
    dynamicContext: input.dynamicContext,
  });

  // 2. Construye messages[] para la API (history + último mensaje del lead).
  const messages = [
    ...input.history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: input.userMessage },
  ];

  // 3. Llamada a Anthropic.
  const startedAt = Date.now();
  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: composed.systemContent as unknown as Anthropic.Messages.TextBlockParam[],
      messages,
      tools: [respondTool] as unknown as Anthropic.Messages.Tool[],
      tool_choice: { type: 'tool', name: RESPOND_AS_INMOBILIARIO_TOOL_NAME },
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    await logLlmCall({
      supabase,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      role: 'generator',
      model,
      status: 'error',
      usage: { latencyMs },
      errorMessage: message,
      requestPayload: summarizeRequest(composed.metadata, messages.length, model, maxTokens),
      responsePayload: { error: message },
    });
    throw err;
  }
  const latencyMs = Date.now() - startedAt;

  // 4. Extrae el tool_use.
  const toolUseBlock = response.content.find(
    (c): c is Anthropic.Messages.ToolUseBlock =>
      c.type === 'tool_use' && c.name === RESPOND_AS_INMOBILIARIO_TOOL_NAME,
  );
  if (!toolUseBlock) {
    const errMsg = `Generator did not return tool_use for ${RESPOND_AS_INMOBILIARIO_TOOL_NAME}. stop_reason=${response.stop_reason}`;
    await logLlmCall({
      supabase,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      role: 'generator',
      model,
      status: 'error',
      usage: { latencyMs },
      errorMessage: errMsg,
      requestPayload: summarizeRequest(composed.metadata, messages.length, model, maxTokens),
      responsePayload: { stop_reason: response.stop_reason, content: response.content.map((c) => c.type) },
    });
    throw new Error(errMsg);
  }

  const inmobiliarioOutput = validateInmobiliarioOutput(toolUseBlock.input);

  // 5. Calcula tokens y coste.
  const usage = response.usage;
  const tokensInUncached = usage.input_tokens ?? 0;
  const tokensInCacheRead = usage.cache_read_input_tokens ?? 0;
  const tokensInCacheWrite = usage.cache_creation_input_tokens ?? 0;
  const tokensOut = usage.output_tokens ?? 0;
  const costUsd = calculateCostUsd({
    model,
    tokensInUncached,
    tokensInCacheRead,
    tokensInCacheWrite,
    tokensOut,
    cacheTtl: CACHE_TTL,
  });

  // 6. Registra llm_calls (best-effort).
  const llmCallId = await logLlmCall({
    supabase,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    role: 'generator',
    model,
    status: 'success',
    usage: {
      tokensInUncached,
      tokensInCacheRead,
      tokensInCacheWrite,
      tokensOut,
      costUsd,
      latencyMs,
      stopReason: response.stop_reason ?? null,
    },
    requestPayload: summarizeRequest(composed.metadata, messages.length, model, maxTokens),
    responsePayload: {
      stop_reason: response.stop_reason,
      ...summarizeInmobiliarioOutput(inmobiliarioOutput),
    },
  });

  return {
    inmobiliarioOutput,
    usage: {
      tokensInUncached,
      tokensInCacheRead,
      tokensInCacheWrite,
      tokensOut,
      costUsd,
      latencyMs,
      stopReason: response.stop_reason ?? null,
    },
    composedPromptMeta: composed.metadata,
    model,
    llmCallId: llmCallId ?? undefined,
  };
}

function summarizeRequest(
  composedMeta: { totalChars: number; blockCount: number; cacheBreakpoints: number; blocksLoaded: string[] },
  messagesCount: number,
  model: string,
  maxTokens: number,
): Record<string, Json | undefined> {
  return {
    model,
    max_tokens: maxTokens,
    system_chars: composedMeta.totalChars,
    system_blocks: composedMeta.blocksLoaded,
    cache_breakpoints: composedMeta.cacheBreakpoints,
    messages_count: messagesCount,
    tool: RESPOND_AS_INMOBILIARIO_TOOL_NAME,
  };
}

/** Valida que el shape devuelto por el modelo cumple `InmobiliarioToolOutput`. */
export function validateInmobiliarioOutput(raw: unknown): InmobiliarioToolOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Generator tool_use input is not an object: ${typeof raw}`);
  }
  const r = raw as Record<string, unknown>;

  const message_raw = r.message_raw;
  if (typeof message_raw !== 'string' || message_raw.length === 0) {
    throw new Error('Generator tool_use missing or empty `message_raw`');
  }

  const conversation_status = r.conversation_status;
  if (
    typeof conversation_status !== 'string' ||
    !['active', 'qualified', 'disqualified', 'handoff', 'paused'].includes(conversation_status)
  ) {
    throw new Error(`Generator tool_use invalid conversation_status: ${String(conversation_status)}`);
  }

  const phase_decision = r.phase_decision;
  if (
    typeof phase_decision !== 'number' ||
    !Number.isInteger(phase_decision) ||
    phase_decision < 0 ||
    phase_decision > 7
  ) {
    throw new Error(`Generator tool_use invalid phase_decision: ${String(phase_decision)}`);
  }

  const detected_intent = r.detected_intent;
  if (
    typeof detected_intent !== 'string' ||
    !['buyer', 'seller', 'unknown'].includes(detected_intent)
  ) {
    throw new Error(`Generator tool_use invalid detected_intent: ${String(detected_intent)}`);
  }

  return {
    message_raw,
    user_summary: typeof r.user_summary === 'string' ? r.user_summary : undefined,
    conversation_status: conversation_status as InmobiliarioToolOutput['conversation_status'],
    phase_decision,
    detected_intent: detected_intent as InmobiliarioToolOutput['detected_intent'],
    // IDs de inmuebles propuestos: solo enteros. V19 verifica que ⊆ inyectados.
    proposed_property_ids: Array.isArray(r.proposed_property_ids)
      ? (r.proposed_property_ids.filter(
          (x): x is number => typeof x === 'number' && Number.isInteger(x),
        ) as number[])
      : undefined,
    // ISO 8601 — la validación de formato la hace el caller (motor → agendar_visita).
    proposed_visit_slot:
      typeof r.proposed_visit_slot === 'string' && r.proposed_visit_slot.trim() !== ''
        ? r.proposed_visit_slot.trim()
        : undefined,
    is_tasation_visit: typeof r.is_tasation_visit === 'boolean' ? r.is_tasation_visit : undefined,
    contraoferta_registrada:
      typeof r.contraoferta_registrada === 'string' && r.contraoferta_registrada.trim() !== ''
        ? r.contraoferta_registrada.trim()
        : undefined,
    handoff_cause:
      typeof r.handoff_cause === 'string' &&
      ['A_agenda', 'B_derivacion', 'C_descualificado', 'D_espera', 'E_error'].includes(r.handoff_cause)
        ? (r.handoff_cause as InmobiliarioToolOutput['handoff_cause'])
        : undefined,
    handoff_reason: typeof r.handoff_reason === 'string' ? r.handoff_reason : undefined,
    reasoning: typeof r.reasoning === 'string' ? r.reasoning : undefined,
    // Razonamiento estructurado por turno (opcional). Cualquier campo no string
    // queda undefined y persiste como NULL en BD (sin regresión).
    emotion: typeof r.emotion === 'string' ? r.emotion : undefined,
    problem: typeof r.problem === 'string' ? r.problem : undefined,
    goal: typeof r.goal === 'string' ? r.goal : undefined,
    urgency: typeof r.urgency === 'string' ? r.urgency : undefined,
    next_action: typeof r.next_action === 'string' ? r.next_action : undefined,
    general_context: typeof r.general_context === 'string' ? r.general_context : undefined,
    general_motivation:
      typeof r.general_motivation === 'string' ? r.general_motivation : undefined,
    captured_lead_name:
      typeof r.captured_lead_name === 'string' && r.captured_lead_name.trim() !== ''
        ? r.captured_lead_name.trim()
        : undefined,
    captured_lead_email:
      typeof r.captured_lead_email === 'string' && r.captured_lead_email.trim() !== ''
        ? r.captured_lead_email.trim().toLowerCase()
        : undefined,
    resources_to_send: Array.isArray(r.resources_to_send)
      ? (r.resources_to_send.filter((x) => typeof x === 'string') as string[])
      : undefined,
  };
}
