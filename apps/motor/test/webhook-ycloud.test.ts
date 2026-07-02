import { describe, it, expect, vi } from 'vitest';
import { makeFakeDb, makeFakeSupabase } from './_fake-supabase.js';
import {
  processYCloudInbound,
  normalizeWaIdToE164,
  type YCloudProcessDeps,
} from '../src/routes/webhook-ycloud.js';
import {
  verifyYCloudSignature,
  buildYCloudSignatureHeader,
} from '../src/lib/webhook-verify.js';

// ---------- fixtures ----------

const NATIVE_INBOUND = {
  id: 'evt_001',
  type: 'whatsapp.inbound_message.received',
  whatsappInboundMessage: {
    id: 'wamid.ABC123',
    from: '34600111222',
    to: '34999888777',
    timestamp: 1720000000,
    type: 'text',
    text: { body: 'Hola, quiero comprar un piso en Ruzafa' },
    contact: { profile: { name: 'Ana Pérez' }, waId: '34600111222' },
  },
};

const META_STATUS_UPDATE = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'e1',
      changes: [
        { value: { statuses: [{ id: 'wamid.STATUS1', status: 'delivered' }] }, field: 'messages' },
      ],
    },
  ],
};

const NATIVE_AUDIO_NO_TEXT = {
  id: 'evt_002',
  type: 'whatsapp.inbound_message.received',
  whatsappInboundMessage: {
    id: 'wamid.AUDIO1',
    from: '34600111222',
    type: 'audio',
    audio: { link: 'https://media.example.com/a.ogg' },
  },
};

function makeDeps(db = makeFakeDb({ tenant_configs: [{ id: 1, tenant_id: 1, debounce_window_seconds: 10 }] })) {
  const claimDedup = vi.fn().mockResolvedValue(true);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const deps: YCloudProcessDeps = { supabase: makeFakeSupabase(db), claimDedup, enqueue };
  return { db, deps, claimDedup, enqueue };
}

// ---------- normalizeWaIdToE164 ----------

describe('normalizeWaIdToE164', () => {
  it('añade + al wa_id de YCloud (viene sin él)', () => {
    expect(normalizeWaIdToE164('34600111222')).toBe('+34600111222');
  });
  it('limpia símbolos y espacios', () => {
    expect(normalizeWaIdToE164('+34 600-111-222')).toBe('+34600111222');
  });
  it('rechaza números demasiado cortos o largos (E.164: 8-15 dígitos)', () => {
    expect(normalizeWaIdToE164('123')).toBeNull();
    expect(normalizeWaIdToE164('1234567890123456')).toBeNull();
  });
  it('rechaza vacío/null/undefined', () => {
    expect(normalizeWaIdToE164('')).toBeNull();
    expect(normalizeWaIdToE164(null)).toBeNull();
    expect(normalizeWaIdToE164(undefined)).toBeNull();
  });
});

// ---------- processYCloudInbound ----------

describe('processYCloudInbound', () => {
  it('inbound nativo crea lead E.164 + conversación + mensaje + debounce del tenant', async () => {
    const { db, deps, claimDedup, enqueue } = makeDeps();
    const result = await processYCloudInbound(deps, 1, NATIVE_INBOUND);

    expect(result.kind).toBe('processed');
    if (result.kind !== 'processed') throw new Error('unreachable');

    // Lead con phone normalizado a E.164 y nombre del contacto.
    const lead = db.tables.leads?.[0];
    expect(lead?.phone).toBe('+34600111222');
    expect(lead?.full_name).toBe('Ana Pérez');

    // Mensaje inbound con external_msg_id = wamid.
    const msg = db.tables.conversation_messages?.[0];
    expect(msg?.content).toBe('Hola, quiero comprar un piso en Ruzafa');
    expect(msg?.external_msg_id).toBe('wamid.ABC123');
    expect(msg?.role).toBe('lead');

    // Dedup reclamado con el dedupKey del parser y TTL 600.
    expect(claimDedup).toHaveBeenCalledWith('ycloud:1:ycloud-msg:wamid.ABC123', 600);

    // Debounce encolado con la ventana del tenant (10s del fixture, no el default).
    expect(enqueue).toHaveBeenCalledWith(result.conversationId, 10);
  });

  it('status update (delivery receipt) se ignora sin escribir nada', async () => {
    const { db, deps, enqueue } = makeDeps();
    const result = await processYCloudInbound(deps, 1, META_STATUS_UPDATE);
    expect(result).toEqual({ kind: 'ignored', reason: 'status_update' });
    expect(db.tables.leads ?? []).toHaveLength(0);
    expect(db.tables.conversation_messages ?? []).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('mensaje duplicado (mismo wamid) se dedupea sin escribir', async () => {
    const { db, deps, claimDedup, enqueue } = makeDeps();
    claimDedup.mockResolvedValueOnce(false); // clave ya reclamada = duplicado
    const result = await processYCloudInbound(deps, 1, NATIVE_INBOUND);
    expect(result).toEqual({ kind: 'deduped' });
    expect(db.tables.leads ?? []).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('audio sin texto se ack-ea sin pipeline (multimodal = F12+)', async () => {
    const { db, deps } = makeDeps();
    const result = await processYCloudInbound(deps, 1, NATIVE_AUDIO_NO_TEXT);
    expect(result).toEqual({ kind: 'ignored', reason: 'sin_texto' });
    expect(db.tables.leads ?? []).toHaveLength(0);
  });

  it('payload que no cumple el schema zod lanza (caller responde 400)', async () => {
    const { deps } = makeDeps();
    await expect(processYCloudInbound(deps, 1, { foo: 'bar' })).rejects.toThrow();
  });

  it('mismo lead en dos mensajes = 1 lead, 2 mensajes (idempotencia upsert)', async () => {
    const { db, deps } = makeDeps();
    const second = {
      ...NATIVE_INBOUND,
      whatsappInboundMessage: {
        ...NATIVE_INBOUND.whatsappInboundMessage,
        id: 'wamid.DEF456',
        text: { body: 'Segundo mensaje' },
      },
    };
    await processYCloudInbound(deps, 1, NATIVE_INBOUND);
    await processYCloudInbound(deps, 1, second);
    expect(db.tables.leads).toHaveLength(1);
    expect(db.tables.conversation_messages).toHaveLength(2);
  });
});

// ---------- verifyYCloudSignature (firma HMAC del header YCloud-Signature) ----------
// El branching warn/enforce→401 del handler es espejo literal de webhook-calcom
// (verificado en F10c); aquí se testea la primitiva de verificación.

describe('verifyYCloudSignature', () => {
  const rawBody = JSON.stringify(NATIVE_INBOUND);
  const secret = 'ycloud_test_secret';

  it('acepta una firma válida generada con buildYCloudSignatureHeader', () => {
    const { header } = buildYCloudSignatureHeader({ rawBody, secret });
    expect(verifyYCloudSignature({ rawBody, signatureHeader: header, secret })).toEqual({ ok: true });
  });

  it('rechaza si el body fue alterado (signature_mismatch)', () => {
    const { header } = buildYCloudSignatureHeader({ rawBody, secret });
    const tampered = rawBody.replace('Ruzafa', 'Benimaclet');
    expect(verifyYCloudSignature({ rawBody: tampered, signatureHeader: header, secret })).toEqual({
      ok: false,
      reason: 'signature_mismatch',
    });
  });

  it('rechaza timestamp fuera de tolerancia (anti-replay)', () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const { header } = buildYCloudSignatureHeader({ rawBody, secret, timestampSeconds: old });
    expect(verifyYCloudSignature({ rawBody, signatureHeader: header, secret })).toEqual({
      ok: false,
      reason: 'timestamp_too_old',
    });
  });

  it('rechaza header malformado y secret vacío', () => {
    expect(verifyYCloudSignature({ rawBody, signatureHeader: 'garbage', secret })).toEqual({
      ok: false,
      reason: 'malformed_header',
    });
    const { header } = buildYCloudSignatureHeader({ rawBody, secret });
    expect(verifyYCloudSignature({ rawBody, signatureHeader: header, secret: '' })).toEqual({
      ok: false,
      reason: 'invalid_secret',
    });
  });
});
