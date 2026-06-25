import { describe, it, expect } from 'vitest';
import { makeFakeDb, makeFakeSupabase } from './_fake-supabase.js';
import { sendAgentReply } from '../src/services/outbound-sender.js';

describe('sendAgentReply (mock)', () => {
  it('escribe parts en mock_whatsapp_outbox y persiste conversation_messages(role=agent)', async () => {
    const db = makeFakeDb({ mock_whatsapp_outbox: [], conversation_messages: [] });
    const supabase = makeFakeSupabase(db);

    const res = await sendAgentReply({
      supabase,
      tenantId: 1,
      conversationId: 9,
      toPhone: '+34600111222',
      parts: ['Hola, soy de Vega Hogar.', '¿En qué zona buscas?'],
      provider: 'mock',
    });

    // Outbox: una fila con las parts (sin phone).
    expect(db.tables.mock_whatsapp_outbox!).toHaveLength(1);
    const outbox = db.tables.mock_whatsapp_outbox![0]!;
    expect(outbox.conversation_id).toBe(9);
    expect(outbox.parts).toEqual(['Hola, soy de Vega Hogar.', '¿En qué zona buscas?']);
    expect(outbox.status).toBe('pending');
    expect(outbox).not.toHaveProperty('to_phone');

    // Thread: una fila por burbuja, role=agent.
    expect(db.tables.conversation_messages!).toHaveLength(2);
    expect(db.tables.conversation_messages!.every((m) => m.role === 'agent')).toBe(true);
    expect(res.messageIds).toHaveLength(2);
    expect(res.providerMessageIds).toHaveLength(1); // id de la fila outbox
  });

  it('omite burbujas vacías y no escribe nada si todo está vacío', async () => {
    const db = makeFakeDb({ mock_whatsapp_outbox: [], conversation_messages: [] });
    const supabase = makeFakeSupabase(db);
    const res = await sendAgentReply({ supabase, tenantId: 1, conversationId: 9, toPhone: null, parts: ['  ', ''], provider: 'mock' });
    expect(res).toEqual({ providerMessageIds: [], messageIds: [] });
    expect(db.tables.mock_whatsapp_outbox!).toHaveLength(0);
    expect(db.tables.conversation_messages!).toHaveLength(0);
  });
});
