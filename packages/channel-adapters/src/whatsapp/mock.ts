import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import type { OutboundWhatsApp, WhatsAppAdapter, WhatsAppSendResult } from './interface.js';

export interface MockWhatsAppDriverOptions {
  /** Cliente service-role (el motor lo inyecta). */
  supabase: SupabaseClient<Database>;
}

/**
 * Driver mock: simula el BSP persistiendo las burbujas en `mock_whatsapp_outbox`
 * (`parts` JSONB, `status='pending'`). NO guarda phone — se resuelve por join
 * conv→lead cuando el viewer del panel lo necesita (contrato §1). Es el driver del
 * golden path local / simulador para alumnos sin cuenta YCloud (decisión D5).
 */
export class MockWhatsAppDriver implements WhatsAppAdapter {
  readonly provider = 'mock' as const;

  constructor(private readonly options: MockWhatsAppDriverOptions) {}

  async send(message: OutboundWhatsApp): Promise<WhatsAppSendResult> {
    const row: Database['public']['Tables']['mock_whatsapp_outbox']['Insert'] = {
      tenant_id: message.tenantId,
      conversation_id: message.conversationId,
      parts: message.parts,
      status: 'pending',
    };

    const { data, error } = await this.options.supabase
      .from('mock_whatsapp_outbox')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      throw new Error(`MockWhatsAppDriver.send: insert mock_whatsapp_outbox failed: ${error.message}`);
    }

    const outboxId = data ? String(data.id) : 'mock-unknown';
    return { provider: 'mock', providerMessageIds: [outboxId] };
  }
}
