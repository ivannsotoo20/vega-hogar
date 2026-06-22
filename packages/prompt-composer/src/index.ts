import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { buildComposedPrompt } from './builder.js';
import type { ComposeOptions, ComposedPrompt, PromptBlockRow } from './types.js';

export type {
  ComposeOptions,
  ComposedBlock,
  ComposedPrompt,
  PromptBlockRow,
  SystemContentBlock,
  DynamicContext,
  AvailableProperty,
  AvailableSlot,
  LeadContact,
  Track,
} from './types.js';
export { buildComposedPrompt } from './builder.js';
export {
  interpolateCorePlaceholders,
  interpolatePhasePriorities,
  renderDynamicContextBlock,
} from './interpolate.js';

/**
 * Carga los bloques activos de `prompt_blocks` (BD = fuente de verdad, Regla 9) y
 * compone el system prompt del agente.
 *
 * Query: UN solo SELECT con los bloques compartidos (tenant_id IS NULL) + los del
 * tenant solicitado, todos `is_active=true`. NO se filtra por `version` (la columna
 * `version` es un contador que el Cerebro incrementa en cada publish; el contenido
 * vigente es siempre la fila `is_active=true`).
 */
export async function composePrompt(
  supabase: SupabaseClient<Database>,
  options: ComposeOptions,
): Promise<ComposedPrompt> {
  const { data, error } = await supabase
    .from('prompt_blocks')
    .select('block_key, content, sort_order, tenant_id')
    .eq('is_active', true)
    .or(`tenant_id.is.null,tenant_id.eq.${options.tenantId}`);

  if (error) {
    throw new Error(`composePrompt: supabase query failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `composePrompt: no prompt_blocks found for tenant=${options.tenantId} (ni compartidos)`,
    );
  }

  const rows: PromptBlockRow[] = data.map((r) => ({
    block_key: String(r.block_key),
    content: String(r.content),
    sort_order: Number(r.sort_order),
    tenant_id: r.tenant_id === null ? null : Number(r.tenant_id),
  }));

  return buildComposedPrompt(rows, options);
}
