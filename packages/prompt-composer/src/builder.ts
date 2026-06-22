import type {
  ComposeOptions,
  ComposedBlock,
  ComposedPrompt,
  PromptBlockRow,
  SystemContentBlock,
} from './types.js';
import {
  interpolateCorePlaceholders,
  interpolatePhasePriorities,
  renderDynamicContextBlock,
} from './interpolate.js';

/** Bloques que llevan placeholders rich y pasan por interpolación (cacheados, estables por fase). */
const INTERPOLATABLE_BLOCK_KEYS = new Set<string>(['core_v1_base']);

/** Bloques requeridos para una composición válida. `agencia_vega` es opcional. */
const REQUIRED_BLOCK_KEYS = ['core_v1_base', 'output_contract_v1'] as const;

/** Orden de inclusión canónico (por sort_order: 0, 5, 100). */
const WANTED_KEYS = ['core_v1_base', 'agencia_vega', 'output_contract_v1'];

/** Bloques que NUNCA se cachean (cambian turno a turno). */
const OUT_OF_CACHE_KEYS = new Set<string>(['dynamic_context']);

/**
 * Construye el system prompt a partir de filas de `prompt_blocks` + datos dinámicos del turno.
 * Función pura: no toca BD, fácil de testear.
 */
export function buildComposedPrompt(rows: PromptBlockRow[], options: ComposeOptions): ComposedPrompt {
  const {
    tenantId,
    currentPhase,
    cacheStrategy = 'two-point',
    cacheTtl = '1h',
    currentPhaseFocus,
    dynamicContext,
  } = options;

  if (!Number.isInteger(currentPhase) || currentPhase < 0 || currentPhase > 7) {
    throw new Error(`composePrompt: currentPhase must be 0..7, got ${currentPhase}`);
  }

  // Índice por block_key. Ante duplicado (shared vs tenant), preferir el del tenant.
  const byKey = new Map<string, PromptBlockRow>();
  for (const r of rows) {
    const existing = byKey.get(r.block_key);
    if (!existing) {
      byKey.set(r.block_key, r);
      continue;
    }
    if (r.tenant_id === tenantId && existing.tenant_id !== tenantId) {
      byKey.set(r.block_key, r);
    }
  }

  const missingRequired = REQUIRED_BLOCK_KEYS.filter((k) => !byKey.has(k));
  if (missingRequired.length > 0) {
    throw new Error(`composePrompt: missing required blocks: ${missingRequired.join(', ')}`);
  }

  const blocks: ComposedBlock[] = [];
  for (const key of WANTED_KEYS) {
    const row = byKey.get(key);
    if (!row) continue; // agencia_vega opcional
    let text = row.content;
    if (INTERPOLATABLE_BLOCK_KEYS.has(key)) {
      text = interpolateCorePlaceholders(text, { currentPhaseFocus });
      text = interpolatePhasePriorities(text, currentPhase);
    }
    // Claude API rechaza system blocks con texto vacío → defensa.
    if (text.trim().length === 0) continue;
    blocks.push({
      key,
      text,
      cached: false,
      scope: row.tenant_id === null ? 'shared' : 'tenant',
    });
  }

  // Bloque sintético dynamic_context (FUERA de cache), si hay datos del turno.
  const dyn = renderDynamicContextBlock(dynamicContext);
  if (dyn && dyn.trim().length > 0) {
    blocks.push({ key: 'dynamic_context', text: dyn, cached: false, scope: 'dynamic' });
  }

  applyCacheStrategy(blocks, cacheStrategy);

  const systemContent: SystemContentBlock[] = blocks.map((b) => {
    const block: SystemContentBlock = { type: 'text', text: b.text };
    if (b.cached) {
      block.cache_control =
        cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
    }
    return block;
  });

  const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);

  return {
    blocks,
    systemContent,
    metadata: {
      tenantId,
      currentPhase,
      totalChars,
      blockCount: blocks.length,
      blocksLoaded: blocks.map((b) => b.key),
      cacheBreakpoints: blocks.filter((b) => b.cached).length,
    },
  };
}

function applyCacheStrategy(
  blocks: ComposedBlock[],
  strategy: 'two-point' | 'single-point' | 'none',
): void {
  if (blocks.length === 0 || strategy === 'none') return;

  // Último bloque cacheable (saltando dynamic_context que va siempre fuera de cache).
  let lastCacheableIdx = blocks.length - 1;
  while (lastCacheableIdx >= 0 && OUT_OF_CACHE_KEYS.has(blocks[lastCacheableIdx]!.key)) {
    lastCacheableIdx--;
  }
  if (lastCacheableIdx < 0) return;

  if (strategy === 'single-point') {
    blocks[lastCacheableIdx]!.cached = true;
    return;
  }

  // two-point (default): breakpoint tras core_v1_base + breakpoint al final cacheable.
  // Cuando se edita agencia_vega, el core_v1_base sigue cacheado.
  const coreIdx = blocks.findIndex((b) => b.key === 'core_v1_base');
  if (coreIdx >= 0) blocks[coreIdx]!.cached = true;
  if (lastCacheableIdx > coreIdx) blocks[lastCacheableIdx]!.cached = true;
}
