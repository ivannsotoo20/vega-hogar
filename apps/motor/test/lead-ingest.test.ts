import { describe, it, expect } from 'vitest';
import { makeFakeDb, makeFakeSupabase } from './_fake-supabase.js';
import {
  resolveTenantByToken,
  upsertLead,
  getOrCreateConversation,
  insertInboundMessage,
} from '../src/services/lead-ingest.js';

describe('resolveTenantByToken', () => {
  it('resuelve token activo y filtra por purpose', async () => {
    const db = makeFakeDb({
      tenant_tokens: [
        { id: 1, tenant_id: 7, token: 'tok', is_active: true, revoked_at: null, purpose: 'whatsapp_mock' },
      ],
    });
    const supabase = makeFakeSupabase(db);
    expect(await resolveTenantByToken(supabase, 'tok')).toEqual({ tenantId: 7, tokenId: 1 });
    expect(await resolveTenantByToken(supabase, 'tok', 'whatsapp_mock')).toEqual({ tenantId: 7, tokenId: 1 });
    expect(await resolveTenantByToken(supabase, 'tok', 'otro_purpose')).toBeNull();
    expect(await resolveTenantByToken(supabase, 'desconocido')).toBeNull();
    expect(await resolveTenantByToken(supabase, '')).toBeNull();
  });
});

describe('upsertLead — idempotencia (R2: mismo phone 2× = 1 lead)', () => {
  it('crea una vez y reutiliza después', async () => {
    const db = makeFakeDb({ leads: [] });
    const supabase = makeFakeSupabase(db);

    const first = await upsertLead({ supabase, tenantId: 1, phone: '+34600111222', channel: 'whatsapp', fullName: 'Ana' });
    expect(first.created).toBe(true);

    const second = await upsertLead({ supabase, tenantId: 1, phone: '+34600111222', channel: 'whatsapp' });
    expect(second.created).toBe(false);
    expect(second.leadId).toBe(first.leadId);

    // Una sola fila de lead para ese (tenant, phone).
    expect(db.tables.leads!.filter((l) => l.phone === '+34600111222')).toHaveLength(1);
  });

  it('aísla por tenant (mismo phone, distinto tenant = 2 leads)', async () => {
    const db = makeFakeDb({ leads: [] });
    const supabase = makeFakeSupabase(db);
    const a = await upsertLead({ supabase, tenantId: 1, phone: '+34600', channel: 'whatsapp' });
    const b = await upsertLead({ supabase, tenantId: 2, phone: '+34600', channel: 'whatsapp' });
    expect(a.leadId).not.toBe(b.leadId);
    expect(db.tables.leads!).toHaveLength(2);
  });
});

describe('getOrCreateConversation', () => {
  it('crea y luego reutiliza la conversación no descalificada', async () => {
    const db = makeFakeDb({ conversations: [] });
    const supabase = makeFakeSupabase(db);
    const first = await getOrCreateConversation({ supabase, tenantId: 1, leadId: 50, channel: 'whatsapp' });
    expect(first.created).toBe(true);
    const second = await getOrCreateConversation({ supabase, tenantId: 1, leadId: 50, channel: 'whatsapp' });
    expect(second.created).toBe(false);
    expect(second.conversationId).toBe(first.conversationId);
    expect(db.tables.conversations!).toHaveLength(1);
    expect(db.tables.conversations![0]!.current_phase).toBe(0);
    expect(db.tables.conversations![0]!.status).toBe('active');
  });

  it('crea una nueva si la última estaba descalificada', async () => {
    const db = makeFakeDb({
      conversations: [{ id: 1, tenant_id: 1, lead_id: 50, status: 'disqualified', created_at: '2026-06-01T00:00:00Z' }],
    });
    const supabase = makeFakeSupabase(db);
    const res = await getOrCreateConversation({ supabase, tenantId: 1, leadId: 50, channel: 'whatsapp' });
    expect(res.created).toBe(true);
    expect(db.tables.conversations!).toHaveLength(2);
  });
});

describe('insertInboundMessage', () => {
  it('inserta role=lead y actualiza last_message_at', async () => {
    const db = makeFakeDb({
      conversations: [{ id: 9, tenant_id: 1, lead_id: 50, status: 'active', last_message_at: null }],
      conversation_messages: [],
    });
    const supabase = makeFakeSupabase(db);
    const res = await insertInboundMessage({ supabase, tenantId: 1, conversationId: 9, content: 'hola busco piso' });
    expect(res.messageId).toBeGreaterThan(0);
    const msg = db.tables.conversation_messages![0]!;
    expect(msg.role).toBe('lead');
    expect(msg.content).toBe('hola busco piso');
    expect(msg.content_type).toBe('text');
    expect(db.tables.conversations![0]!.last_message_at).not.toBeNull();
  });
});
