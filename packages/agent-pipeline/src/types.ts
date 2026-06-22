import type {
  ComposedPrompt,
  ComposeOptions,
  DynamicContext,
  SystemContentBlock,
} from '@vega-hogar/prompt-composer';

/** Mensajes en el formato de la Messages API de Anthropic. */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Timestamp para ordenar (ms epoch). Solo informativo, no se manda al SDK. */
  timestampMs?: number;
}

/**
 * Output estructurado del Generator (corresponde 1:1 con la tool
 * `respond_as_inmobiliario`). Re-domain inmobiliario de `SetterToolOutput`.
 */
export interface InmobiliarioToolOutput {
  /**
   * Respuesta cruda del agente al lead, antes de pasar por Judge y Splitter.
   * Pueden ir varios mensajes en uno separados por saltos de línea — el Splitter
   * los partirá en burbujas naturales 20-280 chars.
   */
  message_raw: string;
  /** Resumen breve (1-2 frases) de lo que el agente ha entendido del lead. */
  user_summary?: string;
  /** Estado de la conversación tras este turno (1:1 con `conversations.status`). */
  conversation_status:
    | 'active'
    | 'qualified'
    | 'disqualified'
    | 'handoff'
    | 'paused';
  /**
   * Fase decidida tras este turno. 0..7 (catálogo `phases` dual buyer/seller;
   * 0=pre-cualificación/apertura, 7=cierre post-agenda).
   */
  phase_decision: number;
  /**
   * Intención detectada del lead (C5, detección 1er turno). `buyer` cubre
   * comprador/inquilino; `seller` cubre vendedor/arrendador. El motor lo mapea
   * a `leads.intent` (5 valores) en post-pipeline.
   */
  detected_intent: 'buyer' | 'seller' | 'unknown';
  /**
   * IDs de inmuebles que el agente propone este turno. DEBEN ser un subconjunto
   * de los inyectados en el system prompt (`buscar_inmuebles`) — V19 lo verifica.
   */
  proposed_property_ids?: number[];
  /**
   * Si el lead confirma EXPLÍCITAMENTE un slot propuesto, fecha/hora ISO 8601 con
   * offset, copiada literal del listado de slots del system prompt. Renombra
   * `proposed_booking_slot` de SETTER. → `visits.scheduled_for`.
   */
  proposed_visit_slot?: string;
  /** True si la visita agendada es una tasación (track seller). → `visits.is_tasation`. */
  is_tasation_visit?: boolean;
  /** Contraoferta del lead registrada (anti-jugada #5: el agente NO negocia, registra y escala). */
  contraoferta_registrada?: string;
  /** Si conversation_status == 'handoff', motivo categorizado (enum reusado de SETTER). */
  handoff_cause?:
    | 'A_agenda'
    | 'B_derivacion'
    | 'C_descualificado'
    | 'D_espera'
    | 'E_error';
  /** Texto libre del motivo del handoff (complementa `handoff_cause`). */
  handoff_reason?: string;
  /** Razonamiento corto del modelo (debug). No se envía al lead. */
  reasoning?: string;
  // Razonamiento estructurado por turno — se persiste en columnas homónimas de
  // `conversations`. Opcionales (NULL si el modelo no las rellena).
  /** Emoción dominante del lead en este turno. */
  emotion?: string;
  /** Dolor / problema concreto detectado. */
  problem?: string;
  /** Outcome / objetivo que el lead busca. */
  goal?: string;
  /** Nivel de urgencia + contexto. */
  urgency?: string;
  /** Próximo paso del agente. */
  next_action?: string;
  /** Contexto histórico acumulado (diferente del current_context por-turno). */
  general_context?: string;
  /** Motivación profunda / driver del lead. */
  general_motivation?: string;
  /** Nombre real capturado del lead en este turno. → `leads.full_name`. */
  captured_lead_name?: string;
  /** Email capturado del lead en este turno. → `leads.email`. */
  captured_lead_email?: string;
  /** Recursos sugeridos a enviar (claves de dossiers/recursos por nombre). */
  resources_to_send?: string[];
}

/** Input al Generator: todo lo que necesita para producir un turno. */
export interface GeneratorInput {
  tenantId: number;
  /** Si null, es una conversación nueva sin id todavía (caso raro de tests). */
  conversationId: number | null;
  /** Texto del último mensaje del lead. */
  userMessage: string;
  /** Fase activa antes de este turno (0..7). */
  currentPhase: number;
  /** Historial previo (sin incluir userMessage). */
  history: ConversationMessage[];
  /** Modelo Anthropic. Default `DEFAULT_GENERATOR_MODEL` (claude-haiku-4-5). */
  model?: string;
  /** Max tokens del response. Default 1024. */
  maxTokens?: number;
  /**
   * Cap dinámico de mensajes por turno (1-4). El motor lo lee de
   * `tenant_configs` y lo propaga al Generator (tool con `maxLength` ajustado en
   * `message_raw`) y al Splitter (`maxItems`). Default `undefined` → cap 4.
   */
  aiMessagesPerTurnMax?: 1 | 2 | 3 | 4;
  /**
   * Instrucción focal corta de la fase activa (~30-80 tokens). El composer la
   * interpola en `{{current_phase_focus}}` de `core_v1_base` (cacheado, estable
   * por fase). La construye el motor según (fase, track).
   */
  currentPhaseFocus?: string | null;
  /**
   * Datos dinámicos del turno (Opción A / RAG): inmuebles inyectados, slots,
   * fecha, intención, contacto del lead. El composer los renderiza en el bloque
   * sintético `dynamic_context` FUERA de cache.
   */
  dynamicContext?: DynamicContext;
  /** Estrategia de cache (passthrough al composer). Default `'two-point'`. */
  cacheStrategy?: ComposeOptions['cacheStrategy'];
  /** TTL del cache (passthrough al composer). Default `'1h'`. */
  cacheTtl?: ComposeOptions['cacheTtl'];
}

export interface GeneratorUsage {
  /** Tokens de entrada NO cacheados (cuentan a 1x rate). */
  tokensInUncached: number;
  /** Tokens leídos del cache (descuento ~0.1x rate). */
  tokensInCacheRead: number;
  /** Tokens escritos al cache (~1.25x rate). */
  tokensInCacheWrite: number;
  /** Tokens de salida (10x rate vs uncached input). */
  tokensOut: number;
  /** Coste estimado en USD. */
  costUsd: number;
  /** Latencia total de la llamada en ms. */
  latencyMs: number;
  /** Stop reason del modelo. */
  stopReason: string | null;
}

export interface GeneratorOutput {
  inmobiliarioOutput: InmobiliarioToolOutput;
  usage: GeneratorUsage;
  /** Metadatos del prompt compuesto (chars, breakpoints, bloques cargados). */
  composedPromptMeta: ComposedPrompt['metadata'];
  /** Modelo usado en la llamada. */
  model: string;
  /** ID de la fila en `llm_calls` (si se registró correctamente). */
  llmCallId?: number;
}

/** Tool definition compatible con Anthropic Messages API. */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Cache opcional (ahora no lo usamos). */
  cache_control?: { type: 'ephemeral' };
}

export type SystemContent = SystemContentBlock[];
