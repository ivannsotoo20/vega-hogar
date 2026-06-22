import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import {
  createWhatsAppAdapter,
  MockWhatsAppDriver,
  YCloudWhatsAppDriver,
  parseYCloudInbound,
} from '../src/index.js';

/**
 * Fake mínimo de SupabaseClient<Database> que captura el INSERT a
 * mock_whatsapp_outbox y devuelve un id sintético. Solo soporta la cadena
 * `.from(table).insert(row).select('id').single()` que usa MockWhatsAppDriver.
 */
function makeFakeSupabase() {
  const calls: Array<{ table: string; row: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ table, row });
          return {
            select() {
              return {
                async single() {
                  return { data: { id: 42 }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe('createWhatsAppAdapter — factory por WHATSAPP_PROVIDER', () => {
  it('provider=mock → MockWhatsAppDriver', () => {
    const { client } = makeFakeSupabase();
    const adapter = createWhatsAppAdapter({ provider: 'mock', supabase: client });
    expect(adapter).toBeInstanceOf(MockWhatsAppDriver);
    expect(adapter.provider).toBe('mock');
  });

  it('provider=ycloud → YCloudWhatsAppDriver', () => {
    const adapter = createWhatsAppAdapter({
      provider: 'ycloud',
      ycloud: { apiKey: 'k', businessPhone: '+34600000000' },
    });
    expect(adapter).toBeInstanceOf(YCloudWhatsAppDriver);
    expect(adapter.provider).toBe('ycloud');
  });

  it('provider=mock sin supabase → error', () => {
    expect(() => createWhatsAppAdapter({ provider: 'mock' })).toThrow(/supabase requerido/);
  });

  it('provider=ycloud sin config → error', () => {
    expect(() => createWhatsAppAdapter({ provider: 'ycloud' })).toThrow(/config\.ycloud requerido/);
  });
});

describe('MockWhatsAppDriver.send', () => {
  it('inserta parts en mock_whatsapp_outbox (status=pending, sin phone) y devuelve outboxId', async () => {
    const { client, calls } = makeFakeSupabase();
    const adapter = createWhatsAppAdapter({ provider: 'mock', supabase: client });

    const result = await adapter.send({
      tenantId: 1,
      conversationId: 7,
      toPhone: '+34611111111', // el mock lo ignora
      parts: ['Hola, soy de Vega Hogar.', '¿En qué zona buscas?'],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.table).toBe('mock_whatsapp_outbox');
    expect(calls[0]!.row).toMatchObject({
      tenant_id: 1,
      conversation_id: 7,
      parts: ['Hola, soy de Vega Hogar.', '¿En qué zona buscas?'],
      status: 'pending',
    });
    // El mock NO guarda phone (se resuelve por join conv→lead).
    expect(calls[0]!.row).not.toHaveProperty('to_phone');
    expect(result).toEqual({ provider: 'mock', providerMessageIds: ['42'] });
  });
});

describe('YCloudWhatsAppDriver.send', () => {
  it('envía una request por burbuja (fetch mock) y recoge los providerMessageIds', async () => {
    const urls: string[] = [];
    let n = 0;
    const fetchImpl = (async (url: string) => {
      urls.push(String(url));
      n += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: `wamid-${n}`, status: 'accepted' };
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const adapter = new YCloudWhatsAppDriver({
      apiKey: 'k',
      businessPhone: '+34600000000',
      fetchImpl,
    });

    const result = await adapter.send({
      tenantId: 1,
      conversationId: 7,
      toPhone: '+34611111111',
      parts: ['parte uno', '   ', 'parte dos'], // la parte vacía se omite
    });

    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/v2/whatsapp/messages/sendDirectly');
    expect(result.provider).toBe('ycloud');
    expect(result.providerMessageIds).toEqual(['wamid-1', 'wamid-2']);
  });

  it('lanza si toPhone es null (canal real necesita destinatario)', async () => {
    const adapter = new YCloudWhatsAppDriver({ apiKey: 'k', businessPhone: '+34600000000' });
    await expect(
      adapter.send({ tenantId: 1, conversationId: 7, toPhone: null, parts: ['hola'] }),
    ).rejects.toThrow(/toPhone requerido/);
  });
});

describe('parseYCloudInbound — smoke (normaliza a InboundMessage)', () => {
  it('meta-style: extrae texto + wa_id del primer mensaje', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                contacts: [{ profile: { name: 'Ana' }, wa_id: '34611111111' }],
                messages: [
                  { id: 'wamid.A', from: '34611111111', type: 'text', text: { body: 'busco piso en Ruzafa' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const result = parseYCloudInbound(payload, 1);
    expect(result.isStatusUpdate).toBe(false);
    expect(result.message?.channel).toBe('whatsapp');
    expect(result.message?.externalUserId).toBe('34611111111');
    expect(result.message?.text).toBe('busco piso en Ruzafa');
    expect(result.dedupKey).toBe('ycloud-msg:wamid.A');
  });

  it('meta-style status update → message null, isStatusUpdate true', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba1',
          changes: [
            {
              field: 'messages',
              value: { statuses: [{ id: 'wamid.S', status: 'delivered' }] },
            },
          ],
        },
      ],
    };
    const result = parseYCloudInbound(payload, 1);
    expect(result.message).toBeNull();
    expect(result.isStatusUpdate).toBe(true);
    expect(result.dedupKey).toBe('ycloud-status:wamid.S');
  });
});
