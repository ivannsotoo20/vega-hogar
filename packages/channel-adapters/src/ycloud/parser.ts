import type { InboundMessage } from '../types.js';
import {
  ycloudInboundPayloadSchema,
  type YCloudContact,
  type YCloudInboundPayload,
  type YCloudMessage,
  type YCloudStatus,
} from './types.js';

/**
 * Resultado del parser. Si `message` es null y `isStatusUpdate` es true, el
 * payload era un evento de status (sent/delivered/read/failed) que el caller debe
 * ignorar (200 ack sin pipeline).
 */
export interface YCloudParsedResult {
  payload: YCloudInboundPayload;
  message: InboundMessage | null;
  isStatusUpdate: boolean;
  /** ID único del evento (para dedup). */
  dedupKey: string | null;
}

/**
 * Valida un payload crudo de YCloud y lo normaliza al modelo interno InboundMessage.
 * Lanza Error si el payload no cumple el schema (caller debe mapear a 400).
 *
 * Soporta dos formatos: Meta-style passthrough y native YCloud (`whatsappInboundMessage`).
 * No persiste, no deduplica, no transcribe — solo normaliza.
 */
export function parseYCloudInbound(
  rawPayload: unknown,
  tenantId: number,
): YCloudParsedResult {
  const payload = ycloudInboundPayloadSchema.parse(rawPayload) as Record<string, unknown>;

  if (isMetaStylePayload(payload)) {
    return parseMetaStyle(payload, tenantId);
  }
  if (isNativePayload(payload)) {
    return parseNative(payload, tenantId);
  }
  return { payload, message: null, isStatusUpdate: false, dedupKey: null };
}

// ---------- Type guards ----------

function isMetaStylePayload(p: Record<string, unknown>): boolean {
  const entry = p.entry;
  return Array.isArray(entry) && entry.length > 0;
}

function isNativePayload(p: Record<string, unknown>): boolean {
  return typeof p.type === 'string';
}

// ---------- Sub-parsers ----------

function parseMetaStyle(
  payload: Record<string, unknown>,
  tenantId: number,
): YCloudParsedResult {
  const entries = (payload.entry as Array<Record<string, unknown>>) ?? [];
  for (const entry of entries) {
    const changes = (entry.changes as Array<Record<string, unknown>>) ?? [];
    for (const change of changes) {
      const value = (change.value as Record<string, unknown>) ?? {};
      const statuses = value.statuses as YCloudStatus[] | undefined;
      const messages = value.messages as YCloudMessage[] | undefined;
      const contacts = value.contacts as YCloudContact[] | undefined;

      const firstStatus = statuses?.[0];
      if (firstStatus && (!messages || messages.length === 0)) {
        return {
          payload,
          message: null,
          isStatusUpdate: true,
          dedupKey: `ycloud-status:${firstStatus.id}`,
        };
      }
      const firstMessage = messages?.[0];
      if (firstMessage) {
        return {
          payload,
          message: buildInboundMessage(firstMessage, contacts?.[0], tenantId),
          isStatusUpdate: false,
          dedupKey: `ycloud-msg:${firstMessage.id}`,
        };
      }
    }
  }
  return { payload, message: null, isStatusUpdate: false, dedupKey: null };
}

function parseNative(
  payload: Record<string, unknown>,
  tenantId: number,
): YCloudParsedResult {
  const evtType = (typeof payload.type === 'string' ? payload.type : '') ?? '';
  const isStatus = /\.message\.updated$|status/i.test(evtType);

  const inbound =
    (payload.whatsappInboundMessage as YCloudMessage | undefined) ??
    (payload.whatsappMessage as YCloudMessage | undefined);

  if (!inbound) {
    const evtId = typeof payload.id === 'string' ? payload.id : null;
    return {
      payload,
      message: null,
      isStatusUpdate: isStatus,
      dedupKey: evtId ? `ycloud-evt:${evtId}` : null,
    };
  }

  if (isStatus) {
    return {
      payload,
      message: null,
      isStatusUpdate: true,
      dedupKey: `ycloud-status:${inbound.id}`,
    };
  }

  // En native el contacto puede venir embebido en `contact` (singular).
  const inboundRecord = inbound as unknown as Record<string, unknown>;
  const contact = (inboundRecord.contact as YCloudContact | undefined) ?? undefined;

  return {
    payload,
    message: buildInboundMessage(inbound, contact, tenantId),
    isStatusUpdate: false,
    dedupKey: `ycloud-msg:${inbound.id}`,
  };
}

function buildInboundMessage(
  msg: YCloudMessage,
  contact: YCloudContact | undefined,
  tenantId: number,
): InboundMessage {
  const text = extractText(msg);
  const { mediaUrl, mediaType } = extractMedia(msg);
  const timestampMs = msg.timestamp ?? Date.now();

  // YCloud manda phone sin '+'; lo dejamos tal cual como external_id (wa_id).
  const externalUserId = msg.from;

  // Para enriquecer leads, expongo el nombre del contacto si vino en el payload.
  const contactName = contact?.profile?.name;

  return {
    tenantId: String(tenantId),
    externalUserId,
    channel: 'whatsapp',
    text,
    mediaUrl,
    mediaType,
    timestampMs,
    rawPayload: { message: msg, contact, contactName },
  };
}

function extractText(msg: YCloudMessage): string {
  if (msg.type === 'text' && msg.text?.body) return msg.text.body;
  if (msg.type === 'button' && msg.button?.text) return msg.button.text;
  if (msg.type === 'image' && msg.image?.caption) return msg.image.caption;
  if (msg.type === 'video' && msg.video?.caption) return msg.video.caption;
  if (msg.type === 'document' && msg.document?.caption) return msg.document.caption;
  if (msg.type === 'reaction' && msg.reaction?.emoji) return msg.reaction.emoji;
  if (msg.type === 'location') {
    const lat = msg.location?.latitude;
    const lng = msg.location?.longitude;
    return lat != null && lng != null ? `[ubicación ${lat},${lng}]` : '[ubicación]';
  }
  return '';
}

function extractMedia(msg: YCloudMessage): {
  mediaUrl?: string;
  mediaType?: InboundMessage['mediaType'];
} {
  switch (msg.type) {
    case 'audio':
      return { mediaUrl: msg.audio?.link, mediaType: 'audio' };
    case 'image':
      return { mediaUrl: msg.image?.link, mediaType: 'image' };
    case 'video':
      return { mediaUrl: msg.video?.link, mediaType: 'video' };
    case 'document':
      return { mediaUrl: msg.document?.link, mediaType: 'document' };
    default:
      return {};
  }
}
