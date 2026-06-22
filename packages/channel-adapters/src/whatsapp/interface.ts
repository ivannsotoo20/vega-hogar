import type { InboundMessage } from '../types.js';

/** Provider de WhatsApp seleccionable por env `WHATSAPP_PROVIDER`. */
export type WhatsAppProvider = 'mock' | 'ycloud';

/**
 * Mensaje saliente del agente, ya troceado por el Splitter en 1-4 burbujas.
 *
 * Nota de diseño (Vega vs SETTER): SETTER usaba `OutboundMessage` con un único
 * `text` por `externalUserId`. En Vega el outbound son `parts` (burbujas) ligadas
 * a la `conversation`. El `toPhone` solo lo usa el driver real (YCloud); el mock
 * lo ignora porque `mock_whatsapp_outbox` no guarda phone (se resuelve por join
 * conv→lead cuando el viewer del panel lo necesita — contrato §1).
 */
export interface OutboundWhatsApp {
  tenantId: number;
  conversationId: number;
  /** Destinatario E.164/wa_id. Requerido por drivers reales; el mock lo ignora. */
  toPhone: string | null;
  /** Burbujas a enviar (1-4). */
  parts: string[];
}

export interface WhatsAppSendResult {
  provider: WhatsAppProvider;
  /** IDs del provider: uno por burbuja en YCloud; `[outboxId]` en mock. */
  providerMessageIds: string[];
}

/**
 * Contrato del driver de WhatsApp (outbound). El inbound se normaliza por separado
 * con `parseYCloudInbound` (real, S15) o el parser del webhook mock.
 */
export interface WhatsAppAdapter {
  readonly provider: WhatsAppProvider;
  send(message: OutboundWhatsApp): Promise<WhatsAppSendResult>;
}

export type { InboundMessage };
