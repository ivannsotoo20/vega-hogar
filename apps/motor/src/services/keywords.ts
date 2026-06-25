import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { logger } from '../lib/logger.js';

/**
 * Keywords de automatización (`automation_keywords`): clasifican el inbound para
 * fijar `conversation_source` / gatear (espejo del `wa_inbound_mode` de SETTER).
 * Columna `pattern` (substring case-insensitive) + `type` ∈ bienvenida|lm|inbound|wa_open.
 */

export interface KeywordRow {
  pattern: string;
  type: string;
}

export async function loadKeywords(
  supabase: SupabaseClient<Database>,
  tenantId: number,
): Promise<KeywordRow[]> {
  const { data, error } = await supabase
    .from('automation_keywords')
    .select('pattern, type')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);
  if (error) {
    logger.warn({ err: error.message, tenantId }, '[keywords] load failed');
    return [];
  }
  return (data ?? []).map((r) => ({ pattern: String(r.pattern), type: String(r.type) }));
}

/**
 * Devuelve el `type` del primer keyword cuyo `pattern` aparece (substring
 * case-insensitive) en el texto, o null si ninguno matchea. Función pura.
 */
export function classifyInbound(text: string, keywords: KeywordRow[]): string | null {
  if (!text || text.trim() === '') return null;
  const haystack = text.toLowerCase();
  for (const kw of keywords) {
    const needle = kw.pattern.trim().toLowerCase();
    if (needle !== '' && haystack.includes(needle)) return kw.type;
  }
  return null;
}
