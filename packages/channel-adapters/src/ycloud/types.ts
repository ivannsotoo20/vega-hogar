import { z } from 'zod';

/**
 * Schemas Zod del webhook inbound de YCloud para WhatsApp.
 *
 * YCloud emite dos posibles formatos de payload:
 *
 * 1. **Meta-style** (passthrough de WhatsApp Cloud API):
 *    `{ object: 'whatsapp_business_account', entry: [{ id, changes: [{ value: { messaging_product, metadata, contacts, messages }, field: 'messages' }] }] }`
 *
 * 2. **Native YCloud** (formato propio con wrapper `whatsappInboundMessage` o `whatsappMessage`):
 *    `{ id: 'evt_xxx', type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id, from, to, type, text, ... } }`
 *
 * Ambos formatos se aceptan; el parser detecta cuál es y normaliza.
 *
 * `passthrough()` en cada nivel para tolerar campos adicionales que YCloud añada
 * sin romper. El primer disparo real puede revelar variantes — ajustar entonces.
 */

const timestampField = z
  .union([z.string(), z.number()])
  .transform((v) => {
    const n = typeof v === 'string' ? Number(v) : v;
    if (!Number.isFinite(n)) return Date.now();
    // YCloud puede mandar segundos (Unix) o milisegundos. Si es <1e12, asumimos segundos.
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  });

// ---------- Mensaje individual (Meta-style y native comparten estructura) ----------

const mediaObjectSchema = z
  .object({
    id: z.string().optional(),
    mime_type: z.string().optional(),
    sha256: z.string().optional(),
    link: z.string().optional(),
    caption: z.string().optional(),
    filename: z.string().optional(),
    voice: z.boolean().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    id: z.string(),
    from: z.string(),                       // wa_id sin '+'
    to: z.string().optional(),               // business phone (en native YCloud)
    timestamp: timestampField.optional(),
    type: z.string(),                        // 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'button' | 'reaction' | ...
    text: z.object({ body: z.string() }).passthrough().optional(),
    image: mediaObjectSchema.optional(),
    audio: mediaObjectSchema.optional(),
    video: mediaObjectSchema.optional(),
    document: mediaObjectSchema.optional(),
    sticker: mediaObjectSchema.optional(),
    location: z
      .object({
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        name: z.string().optional(),
        address: z.string().optional(),
      })
      .passthrough()
      .optional(),
    interactive: z.unknown().optional(),
    button: z
      .object({ text: z.string().optional(), payload: z.string().optional() })
      .passthrough()
      .optional(),
    reaction: z
      .object({ message_id: z.string().optional(), emoji: z.string().optional() })
      .passthrough()
      .optional(),
    context: z
      .object({ from: z.string().optional(), id: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const contactSchema = z
  .object({
    profile: z.object({ name: z.string().optional() }).passthrough().optional(),
    wa_id: z.string().optional(),
    waId: z.string().optional(), // YCloud native usa camelCase
  })
  .passthrough();

const statusSchema = z
  .object({
    id: z.string(),
    status: z.string(), // 'sent' | 'delivered' | 'read' | 'failed'
    timestamp: timestampField.optional(),
    recipient_id: z.string().optional(),
  })
  .passthrough();

// ---------- Forma 1: Meta-style ----------

const metadataSchema = z
  .object({
    display_phone_number: z.string().optional(),
    phone_number_id: z.string().optional(),
  })
  .passthrough();

const valueSchema = z
  .object({
    messaging_product: z.string().optional(),
    metadata: metadataSchema.optional(),
    contacts: z.array(contactSchema).optional(),
    messages: z.array(messageSchema).optional(),
    statuses: z.array(statusSchema).optional(),
  })
  .passthrough();

const changeSchema = z
  .object({
    value: valueSchema,
    field: z.string().optional(),
  })
  .passthrough();

const entrySchema = z
  .object({
    id: z.string().optional(),
    changes: z.array(changeSchema).min(1),
  })
  .passthrough();

// Schema interno (no exportado): sirve para `safeParse` dentro del parser. No se
// exporta porque el tipo inferido es demasiado profundo para serializar en builds.
const ycloudMetaStylePayloadSchemaInternal = z
  .object({
    object: z.literal('whatsapp_business_account').optional(),
    entry: z.array(entrySchema).min(1),
  })
  .passthrough();

// ---------- Forma 2: Native YCloud ----------

const inboundWrapperSchema = messageSchema.extend({
  wabaId: z.string().optional(),
  contact: contactSchema.optional(),
});

// Schema interno (no exportado): mismo motivo que el Meta-style.
const ycloudNativePayloadSchemaInternal = z
  .object({
    id: z.string().optional(),
    type: z.string(), // 'whatsapp.inbound_message.received' | 'whatsapp.message.updated' | ...
    whatsappInboundMessage: inboundWrapperSchema.optional(),
    whatsappMessage: messageSchema.optional(),
  })
  .passthrough();

// ---------- Unión final (la única que se exporta para validación externa) ----------
// Anotación `: z.ZodTypeAny` evita que TS intente serializar el tipo profundo del
// schema (TS7056). El parser hace `parse(...)` y obtiene `unknown`, luego navega
// con type guards manuales sobre la forma del objeto.

export const ycloudInboundPayloadSchema: z.ZodTypeAny = z.union([
  ycloudMetaStylePayloadSchemaInternal,
  ycloudNativePayloadSchemaInternal,
]);

export type YCloudInboundPayload = unknown;
export type YCloudMessage = z.infer<typeof messageSchema>;
export type YCloudContact = z.infer<typeof contactSchema>;
export type YCloudStatus = z.infer<typeof statusSchema>;
