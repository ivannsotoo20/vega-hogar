/**
 * Cálculo de coste de llamadas a Anthropic.
 *
 * Tabla de precios (USD por millón de tokens) según el catálogo público de
 * Anthropic. Mantener sincronizado cuando Anthropic ajuste pricing.
 *
 * El cliente puede sobreescribir `priceTable` para tarifas personalizadas
 * (clientes empresariales o tests).
 */

export interface ModelPriceUsdPerMTokens {
  inputUncached: number;
  cacheRead: number;
  /** Cache write con TTL 5min (default histórico). */
  cacheWrite: number;
  /**
   * Cache write con TTL 1h. Anthropic cobra ~2× el rate de 5min. Si se omite,
   * `calculateCostUsd` lo deriva como `2 × cacheWrite`.
   */
  cacheWrite1h?: number;
  output: number;
}

export const DEFAULT_PRICE_TABLE: Record<string, ModelPriceUsdPerMTokens> = {
  // Sonnet 4.5 (claude-sonnet-4-5 / -latest / snapshots)
  'claude-sonnet-4-5': {
    inputUncached: 3.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 7.5,
    output: 15.0,
  },
  // Haiku 4.5 — modelo default de las 3 etapas del pipeline Vega.
  'claude-haiku-4-5': {
    inputUncached: 1.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
    cacheWrite1h: 2.5,
    output: 5.0,
  },
  // Opus 4.5 (referencia, no se usa en el pipeline actual).
  'claude-opus-4-5': {
    inputUncached: 15.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
    cacheWrite1h: 37.5,
    output: 75.0,
  },
};

/**
 * Resuelve el precio para un model id concreto. Acepta alias `-latest` o
 * snapshots `-YYYYMMDD` y los mapea a la familia base.
 */
export function resolvePriceForModel(
  model: string,
  table: Record<string, ModelPriceUsdPerMTokens> = DEFAULT_PRICE_TABLE,
): ModelPriceUsdPerMTokens | null {
  const direct = table[model];
  if (direct) return direct;

  // Heurística por prefix.
  const lower = model.toLowerCase();
  if (lower.includes('sonnet-4-5') || lower.includes('sonnet-4.5')) {
    return table['claude-sonnet-4-5'] ?? null;
  }
  if (lower.includes('haiku-4-5') || lower.includes('haiku-4.5')) {
    return table['claude-haiku-4-5'] ?? null;
  }
  if (lower.includes('opus-4-5') || lower.includes('opus-4.5')) {
    return table['claude-opus-4-5'] ?? null;
  }
  return null;
}

export interface CostInput {
  model: string;
  tokensInUncached: number;
  tokensInCacheRead: number;
  tokensInCacheWrite: number;
  tokensOut: number;
  /**
   * TTL del cache_control que se usó al ESCRIBIR el cache en esta llamada.
   * - `'5m'` (default): tarifa cacheWrite estándar.
   * - `'1h'`: tarifa cacheWrite1h (~2× la de 5min). Si el modelo no define
   *   `cacheWrite1h`, se deriva como `2 × cacheWrite`.
   *
   * Anthropic NO devuelve el TTL en `response.usage`, así que el caller debe
   * pasarlo de acuerdo a lo que configuró en `cache_control.ttl` de la request.
   */
  cacheTtl?: '5m' | '1h';
  priceTable?: Record<string, ModelPriceUsdPerMTokens>;
}

/**
 * Devuelve el coste en USD de una llamada. Si el modelo no existe en la tabla,
 * devuelve 0 (mejor 0 que un número falso).
 */
export function calculateCostUsd(input: CostInput): number {
  const price = resolvePriceForModel(input.model, input.priceTable);
  if (!price) return 0;

  const ttl = input.cacheTtl ?? '5m';
  const cacheWriteRate =
    ttl === '1h' ? (price.cacheWrite1h ?? price.cacheWrite * 2) : price.cacheWrite;

  const cost =
    (input.tokensInUncached * price.inputUncached +
      input.tokensInCacheRead * price.cacheRead +
      input.tokensInCacheWrite * cacheWriteRate +
      input.tokensOut * price.output) /
    1_000_000;

  return Number(cost.toFixed(6));
}
