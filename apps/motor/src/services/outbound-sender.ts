import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { createWhatsAppAdapter } from '@vega-hogar/channel-adapters';
import { env } from '../config/env.js';

/**
 * Envía la respuesta del agente (burbujas del Splitter) por el canal configurado
 * (`WHATSAPP_PROVIDER`) y persiste cada burbuja como `conversation_messages(role='agent')`.
 *
 * En F10b (mock): el driver escribe `mock_whatsapp_outbox(parts, status=pending)`
 * (sin phone — se resuelve por join conv→lead, contrato §1). El driver real YCloud
 * (que sí usa `toPhone`) queda codeado + gated hasta F10c.
 */

export interface SendAgentReplyParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  conversationId: number;
  /** Teléfono del lead (E.164). El mock lo ignora; el real lo usa. */
  toPhone: string | null;
  parts: string[];
  /** Override del provider (tests). Por defecto `env.WHATSAPP_PROVIDER`. */
  provider?: 'mock' | 'ycloud';
}

export interface SendAgentReplyResult {
  providerMessageIds: string[];
  messageIds: number[];
}

export async function sendAgentReply(
  params: SendAgentReplyParams,
): Promise<SendAgentReplyResult> {
  const { supabase, tenantId, conversationId, toPhone, parts } = params;
  const cleanParts = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  if (cleanParts.length === 0) return { providerMessageIds: [], messageIds: [] };

  // Driver por WHATSAPP_PROVIDER. F10b: mock. (F10c cablea businessPhone YCloud.)
  const provider = params.provider ?? env.WHATSAPP_PROVIDER;
  const adapter =
    provider === 'ycloud'
      ? createWhatsAppAdapter({
          provider: 'ycloud',
          ycloud: {
            apiKey: env.YCLOUD_API_KEY ?? '',
            businessPhone: env.YCLOUD_BUSINESS_PHONE ?? '',
            baseUrl: env.YCLOUD_API_BASE,
          },
        })
      : createWhatsAppAdapter({ provider: 'mock', supabase });

  const sendResult = await adapter.send({ tenantId, conversationId, toPhone, parts: cleanParts });

  // Persistir cada burbuja como mensaje del agente (para el thread del panel).
  const rows: Database['public']['Tables']['conversation_messages']['Insert'][] = cleanParts.map((content) => ({
    tenant_id: tenantId,
    conversation_id: conversationId,
    role: 'agent',
    content,
    content_type: 'text',
  }));
  const { data, error } = await supabase.from('conversation_messages').insert(rows).select('id');
  if (error) {
    throw new Error(`sendAgentReply: insert conversation_messages failed: ${error.message}`);
  }

  return {
    providerMessageIds: sendResult.providerMessageIds,
    messageIds: (data ?? []).map((r) => Number(r.id)),
  };
}
