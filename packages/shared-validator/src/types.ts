/**
 * Tipos del validador post-LLM (V00-V19) del agente comercial inmobiliario.
 *
 * El validador es la RED DE SEGURIDAD final del pipeline. Corre tras Judge y
 * antes del Splitter. Sus violaciones son determinísticas (regex/heurísticas) y
 * no dependen de LLM — baratas, predecibles y testeables.
 *
 * Diseño:
 *  - Cada regla es una función pura `(text, ctx) => RuleViolation | null`.
 *  - El runner devuelve el array completo de violaciones.
 *  - Severidad `error` debe bloquear el envío del mensaje (degradar / handoff).
 *  - Severidad `warn` se loggea pero el mensaje sigue.
 */

/** Canales del agente en Vega (WhatsApp ahora; voz en F12). */
export type Channel = 'whatsapp' | 'voice';

/** Track del flujo dual (decisión C5: un agente, dos flujos). */
export type Track = 'buyer' | 'seller' | 'shared';

export interface ValidationContext {
  tenantId: number;
  conversationId: number | null;
  /** Fase activa 0..7 al evaluar este turno (catálogo `phases`). */
  currentPhase: number;
  channel: Channel;
  /** Track del lead (comprador/vendedor/compartido). Informativo para V11′. */
  track?: Track;
  /** Whitelist de emojis. Si está vacía o null, todos permitidos. */
  emojisWhitelist?: string[] | null;
  /** Es el primer mensaje del bot en la conversación (no permite saludo repetido). */
  isFirstAssistantMessage?: boolean;
  /** Últimos N mensajes del bot para detectar repetición. */
  lastAssistantMessages?: string[];
  /** Locale principal (es-ES). Informativo. */
  locale?: string;
  /**
   * Lista de palabras/frases prohibidas por la agencia (sanitizadas: trim +
   * lowercase). Si vacía o undefined, V17 no dispara.
   */
  forbiddenPhrases?: string[];
  /**
   * Tratamiento ESPERADO del agente al lead (cumplimiento estricto).
   * 'tu' o 'usted' → V18 valida que el output coincide. undefined → V18 skipea
   * (caso 'mirror_lead': el motor inyecta directiva dinámica según el lead).
   */
  expectedAddressing?: 'tu' | 'usted';
  /**
   * V19 anti-alucinación: IDs de inmuebles realmente INYECTADOS en el system
   * prompt este turno (de `buscar_inmuebles`). SIEMPRE array (nunca undefined):
   * si el motor no buscó, pasa `[]` → cualquier id propuesto es fantasma.
   */
  injectedPropertyIds?: number[];
  /**
   * V19 anti-alucinación: IDs de inmuebles que la tool-output `respond_as_inmobiliario`
   * propone (proposed_property_ids). Deben ser ⊆ injectedPropertyIds.
   */
  proposedPropertyIds?: number[];
}

export interface RuleViolation {
  ruleId: string;
  description: string;
  severity: 'warn' | 'error';
  /** Fragmento del texto que dispara la regla (debug). */
  match?: string;
  /** Sugerencia de fix automático si aplica. */
  suggestion?: string;
}

export type RuleCheck = (text: string, ctx: ValidationContext) => RuleViolation | null;

export interface ValidationRule {
  id: string;
  description: string;
  /** Si la regla todavía no tiene heurística real (solo placeholder). */
  stub?: boolean;
  check: RuleCheck;
}

export interface ValidationResult {
  ok: boolean;
  /** True si hay alguna violación con severity='error'. */
  hasErrors: boolean;
  violations: RuleViolation[];
}

export interface ValidateOptions {
  /** Sustituye el set por defecto. */
  rules?: ValidationRule[];
  /** Solo correr reglas con estos ids (whitelist). */
  only?: string[];
  /** Saltar reglas con estos ids (blacklist). */
  skip?: string[];
}
