import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { logger } from '../lib/logger.js';

/**
 * Modelos por etapa del pipeline (lo que espera `runPipeline({ models })`).
 * Adición Vega: el motor carga los modelos de `llm_configs` (3 filas seed:
 * generator/judge/splitter, todas `claude-haiku-4-5`) y los pasa al pipeline.
 * Default conservador si la fila no existe o la query falla.
 */
export interface LlmModels {
  generator?: string;
  judge?: string;
  splitter?: string;
}

const DEFAULT_MODEL = 'claude-haiku-4-5';

export async function loadLlmModels(
  supabase: SupabaseClient<Database>,
  tenantId: number,
): Promise<LlmModels> {
  try {
    const { data, error } = await supabase
      .from('llm_configs')
      .select('role, model, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    if (error) {
      logger.warn({ err: error.message, tenantId }, '[llm-models] query failed, using defaults');
      return { generator: DEFAULT_MODEL, judge: DEFAULT_MODEL, splitter: DEFAULT_MODEL };
    }
    const byRole = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.model) byRole.set(String(row.role), String(row.model));
    }
    return {
      generator: byRole.get('generator') ?? DEFAULT_MODEL,
      judge: byRole.get('judge') ?? DEFAULT_MODEL,
      splitter: byRole.get('splitter') ?? DEFAULT_MODEL,
    };
  } catch (err) {
    logger.warn({ err, tenantId }, '[llm-models] unexpected error, using defaults');
    return { generator: DEFAULT_MODEL, judge: DEFAULT_MODEL, splitter: DEFAULT_MODEL };
  }
}
