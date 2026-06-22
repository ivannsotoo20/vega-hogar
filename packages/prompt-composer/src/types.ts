/**
 * Tipos del prompt-composer del agente comercial inmobiliario (Vega Hogar).
 *
 * Modelo de bloques (más simple que SETTER — sin coach/trainer_prefs/admin_overrides):
 *   1. core_v1_base       (compartido, tenant_id IS NULL, sort=0)   — Cerebro universal: identidad,
 *                                                                      reglas, flujo dual, fases 0-7 inline.
 *   2. agencia_vega       (tenant, sort=5, OPCIONAL)                 — Voz/doctrina de la agencia (Vega).
 *   3. output_contract_v1 (compartido, sort=100)                    — Schema técnico del output (respond_as_inmobiliario).
 *   4. dynamic_context    (SINTÉTICO, sort=∞, FUERA DE CACHE)        — Datos del turno: inmuebles inyectados,
 *                                                                      slots, fecha, intención, contacto del lead.
 *
 * Cache breakpoints (Anthropic `cache_control: { type: 'ephemeral' }`):
 *   - `two-point` (default): breakpoint tras `core_v1_base` (cachea cerebro universal) +
 *     breakpoint tras el último bloque cacheable (prefix invariante).
 *   - `dynamic_context` queda SIEMPRE fuera del cache (cambia turno a turno) → corrige el bug
 *     de SETTER de interpolar datos dinámicos dentro del CORE cacheado.
 *   - `{{current_phase_focus}}` y `{{phaseN_priority}}` SÍ se interpolan dentro de `core_v1_base`
 *     (cacheado): son estables por (fase, track), el cache se mantiene dentro de una misma fase.
 *
 * Historial y mensaje actual van como `messages[]` y NUNCA cacheados.
 */

/** Track del flujo dual (decisión C5). */
export type Track = 'buyer' | 'seller' | 'shared';

/** Inmueble inyectado por `buscar_inmuebles` (PRE-pipeline). */
export interface AvailableProperty {
  id: number;
  title: string;
  neighborhood: string;
  /** Etiqueta de precio ya formateada ("320.000 €" venta / "1.200 €/mes" alquiler). */
  priceLabel: string;
  rooms: number;
  m2: number;
  /** Motivo del match (zona exacta, dentro de presupuesto, etc.). */
  matchReason?: string | null;
}

/** Slot de disponibilidad para agendar visita/tasación. */
export interface AvailableSlot {
  iso: string;
  humanLabel: string;
}

export interface LeadContact {
  fullName: string | null;
  email: string | null;
}

/**
 * Datos dinámicos del turno → se renderizan a un bloque sintético `dynamic_context`
 * FUERA del cache. `availableProperties = []` (array vacío) significa "se buscó y no
 * hubo resultados" (distinto de `undefined`/`null` = "no se buscó este turno").
 */
export interface DynamicContext {
  currentDateLabel?: string | null;
  leadIntent?: Track | null;
  leadContact?: LeadContact | null;
  availableProperties?: AvailableProperty[] | null;
  availableSlots?: AvailableSlot[] | null;
}

export interface ComposeOptions {
  tenantId: number;
  /** Fase activa 0..7 (catálogo `phases`). Inyectada por el motor por turno. */
  currentPhase: number;
  /**
   * Instrucción focal corta de la fase activa. La construye el motor según
   * (fase, track) y se interpola en `{{current_phase_focus}}` de `core_v1_base`.
   * Estable por fase → puede ir dentro del bloque cacheado.
   */
  currentPhaseFocus?: string | null;
  /** Estrategia de cache. Default `'two-point'`. */
  cacheStrategy?: 'two-point' | 'single-point' | 'none';
  /** TTL del cache. Default `'1h'`. */
  cacheTtl?: '5m' | '1h';
  /** Datos dinámicos del turno → bloque `dynamic_context` fuera de cache. */
  dynamicContext?: DynamicContext;
}

/** Una fila de `prompt_blocks` que el builder necesita para componer. */
export interface PromptBlockRow {
  block_key: string;
  content: string;
  sort_order: number;
  tenant_id: number | null;
}

export interface ComposedBlock {
  key: string;
  text: string;
  cached: boolean;
  scope: 'shared' | 'tenant' | 'dynamic';
}

/** Bloque en el formato que espera la Messages API de Anthropic (campo `system`). */
export interface SystemContentBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
}

export interface ComposedPrompt {
  blocks: ComposedBlock[];
  /** Listo para enviar como `system` a la Messages API de Anthropic. */
  systemContent: SystemContentBlock[];
  metadata: {
    tenantId: number;
    currentPhase: number;
    totalChars: number;
    blockCount: number;
    blocksLoaded: string[];
    cacheBreakpoints: number;
  };
}
