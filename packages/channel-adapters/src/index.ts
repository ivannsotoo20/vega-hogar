// @vega-hogar/channel-adapters — drivers de canales del agente.
// F10 S9: WhatsApp (YCloud + mock, factory por WHATSAPP_PROVIDER).
// F12: voz (Zadarma + ElevenLabs + STT).

// ---------- Tipos base ----------
export type { Channel, InboundMessage } from './types.js';

// ---------- WhatsApp: abstracción Vega (outbound) ----------
export type {
  WhatsAppProvider,
  OutboundWhatsApp,
  WhatsAppSendResult,
  WhatsAppAdapter,
} from './whatsapp/interface.js';
export { YCloudWhatsAppDriver, type YCloudWhatsAppDriverOptions } from './whatsapp/ycloud.js';
export { MockWhatsAppDriver, type MockWhatsAppDriverOptions } from './whatsapp/mock.js';
export { createWhatsAppAdapter, type WhatsAppFactoryConfig } from './whatsapp/factory.js';

// ---------- YCloud (BSP oficial Meta) — transporte de bajo nivel ----------
export {
  ycloudSendText,
  YCloudApiError,
  type YCloudSendTextParams,
  type YCloudSendTextResult,
} from './ycloud/api-client.js';
export { parseYCloudInbound, type YCloudParsedResult } from './ycloud/parser.js';
export {
  ycloudListTemplates,
  ycloudSendTemplate,
  extractTemplateBody,
  extractTemplateVariables,
  YCloudTemplatesError,
  type YCloudTemplateRow,
  type YCloudListTemplatesParams,
  type YCloudSendTemplateParams,
  type YCloudSendTemplateResult,
} from './ycloud/templates.js';
export {
  ycloudInboundPayloadSchema,
  type YCloudInboundPayload,
  type YCloudMessage,
  type YCloudContact,
  type YCloudStatus,
} from './ycloud/types.js';
