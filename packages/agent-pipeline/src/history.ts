import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import type { ConversationMessage } from './types.js';

/** Rol de mensaje en BD (enum `message_role`). */
type DbMessageRole = Database['public']['Enums']['message_role'];

/** Fila mínima de `conversation_messages` que necesita el mapeo de historial. */
export interface HistoryRow {
  id: number;
  content: string | null;
  role: DbMessageRole;
  created_at: string;
}

/**
 * ⚠ Adaptación DB clave (Vega vs SETTER):
 * Vega guarda el rol en la columna `role` (enum `message_role`:
 * lead/agent/human/system), NO en `source` (lead/ai/human) como SETTER.
 *
 * Mapeo a la Messages API de Anthropic:
 *   - `lead`                  → 'user'
 *   - `agent` | `human` | `system` → 'assistant'
 *
 * Función PURA (no toca BD): ordena cronológicamente por `created_at` (tiebreak
 * por `id`), salta `excludeMessageId`, ignora mensajes con `content` vacío
 * (p.ej. audios sin transcripción), y mapea el rol. Fácil de testear.
 */
export function rowsToConversationMessages(
  rows: HistoryRow[],
  options: { excludeMessageId?: number } = {},
): ConversationMessage[] {
  const { excludeMessageId } = options;

  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return Number(a.id) - Number(b.id);
  });

  const result: ConversationMessage[] = [];
  for (const m of sorted) {
    if (excludeMessageId !== undefined && Number(m.id) === excludeMessageId) {
      continue;
    }
    if (m.content == null || String(m.content).trim() === '') {
      continue;
    }
    const role: ConversationMessage['role'] = m.role === 'lead' ? 'user' : 'assistant';
    result.push({
      role,
      content: String(m.content),
      timestampMs: new Date(m.created_at).getTime(),
    });
  }

  return result;
}

/**
 * Carga el historial de mensajes de una conversación desde `conversation_messages`,
 * lo limita a las últimas N filas y lo formatea para la Messages API.
 *
 * El último mensaje del lead (el que disparó este turno) se PASA POR SEPARADO al
 * `runGenerator` (no se incluye aquí — el caller decide qué considera "último",
 * vía `excludeMessageId` o no cargándolo).
 */
export async function loadConversationHistory(
  supabase: SupabaseClient<Database>,
  conversationId: number,
  options: { limit?: number; excludeMessageId?: number } = {},
): Promise<ConversationMessage[]> {
  const { limit = 60, excludeMessageId } = options;

  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, content, role, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`loadConversationHistory failed: ${error.message}`);
  }
  if (!data) return [];

  return rowsToConversationMessages(data as HistoryRow[], { excludeMessageId });
}
