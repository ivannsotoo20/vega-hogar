import { ycloudSendText } from '../ycloud/api-client.js';
import type { OutboundWhatsApp, WhatsAppAdapter, WhatsAppSendResult } from './interface.js';

export interface YCloudWhatsAppDriverOptions {
  apiKey: string;
  /** Número del business en E.164 (ej '+34611223344'). Va como `from`. */
  businessPhone: string;
  /** Override URL base (testing / go-live). */
  baseUrl?: string;
  /** Override fetch (testing). */
  fetchImpl?: typeof fetch;
}

/**
 * Driver real YCloud (BSP oficial Meta). Envía cada burbuja como un mensaje de
 * texto independiente vía `sendDirectly`. Codeado + testeado (HTTP mock); el
 * go-live (cuenta YCloud + plantilla aprobada) es gate externo posterior a F10.
 */
export class YCloudWhatsAppDriver implements WhatsAppAdapter {
  readonly provider = 'ycloud' as const;

  constructor(private readonly options: YCloudWhatsAppDriverOptions) {
    if (!options.apiKey) throw new Error('YCloudWhatsAppDriver: apiKey requerida');
    if (!options.businessPhone) {
      throw new Error('YCloudWhatsAppDriver: businessPhone requerido');
    }
  }

  async send(message: OutboundWhatsApp): Promise<WhatsAppSendResult> {
    if (!message.toPhone) {
      throw new Error('YCloudWhatsAppDriver.send: toPhone requerido para el canal real');
    }
    const providerMessageIds: string[] = [];
    for (const part of message.parts) {
      if (!part || part.trim().length === 0) continue;
      const result = await ycloudSendText({
        apiKey: this.options.apiKey,
        from: this.options.businessPhone,
        to: message.toPhone,
        text: part,
        baseUrl: this.options.baseUrl,
        fetchImpl: this.options.fetchImpl,
      });
      providerMessageIds.push(result.providerMessageId);
    }
    return { provider: 'ycloud', providerMessageIds };
  }
}
