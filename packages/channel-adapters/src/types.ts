/** Canales del agente en Vega (WhatsApp ahora; voz en F12). */
export type Channel = 'whatsapp' | 'voice';

/**
 * Mensaje inbound normalizado (modelo interno, agnóstico de provider). Lo produce
 * `parseYCloudInbound` (webhook real, S15) y el parser del webhook mock. El motor
 * lo consume en `lead-ingest` (S12).
 */
export interface InboundMessage {
  /** tenant_id como string (se castea a number en el motor). */
  tenantId: string;
  /** wa_id del lead (teléfono sin '+'). */
  externalUserId: string;
  channel: Channel;
  text: string;
  mediaUrl?: string;
  mediaType?: 'audio' | 'image' | 'video' | 'document';
  timestampMs: number;
  rawPayload: unknown;
}
