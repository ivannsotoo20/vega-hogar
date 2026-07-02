import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { makeFakeDb, makeFakeSupabase } from './_fake-supabase.js';
import { buildYCloudSignatureHeader } from '../src/lib/webhook-verify.js';

// ---------- mocks de módulo (handler-level; el unit de processYCloudInbound
// vive en webhook-ycloud.test.ts) ----------

const h = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    YCLOUD_WEBHOOK_VERIFY_MODE: 'enforce' as 'enforce' | 'warn' | 'disabled',
  },
  supabaseRef: { current: null as unknown },
  enqueueMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/config/env.js', () => ({ env: h.envMock }));
vi.mock('../src/lib/supabase.js', () => ({ getSupabase: () => h.supabaseRef.current }));
vi.mock('../src/lib/redis.js', () => ({
  getRedis: () => ({}),
  tryClaimDedupKey: vi.fn().mockResolvedValue(true),
  releaseDedupKey: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/lib/debounce-buffer.js', () => ({
  enqueueDebounce: (...args: unknown[]) => h.enqueueMock(...args),
}));

import { webhookYcloudRoutes } from '../src/routes/webhook-ycloud.js';

// ---------- fixtures ----------

const SECRET = 'ycloud_route_secret';
const TOKEN = 'tok-ycloud-route';

const PAYLOAD = {
  id: 'evt_route',
  type: 'whatsapp.inbound_message.received',
  whatsappInboundMessage: {
    id: 'wamid.ROUTE1',
    from: '34600111333',
    type: 'text',
    text: { body: 'Hola, busco piso de alquiler' },
    contact: { profile: { name: 'Route Tester' } },
  },
};

function seedDb() {
  return makeFakeDb({
    tenant_tokens: [
      { id: 1, tenant_id: 1, token: TOKEN, purpose: 'ycloud_webhook', is_active: true, revoked_at: null },
    ],
    integration_accounts: [
      { id: 1, tenant_id: 1, provider: 'ycloud', webhook_secret: SECRET, active: true },
    ],
    tenant_configs: [{ id: 1, tenant_id: 1, debounce_window_seconds: 5 }],
  });
}

async function buildApp() {
  const app = Fastify({ logger: false });
  // Mismo parser que server.ts: conserva rawBody para el HMAC.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
    (_req as unknown as { rawBody?: string }).rawBody = raw;
    try {
      done(null, raw.length > 0 ? JSON.parse(raw) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  await app.register(webhookYcloudRoutes);
  return app;
}

beforeEach(() => {
  h.supabaseRef.current = makeFakeSupabase(seedDb());
  h.enqueueMock.mockClear();
  h.envMock.YCLOUD_WEBHOOK_VERIFY_MODE = 'enforce';
});

describe('POST /webhooks/ycloud/:tenant_token (handler HTTP)', () => {
  it('enforce + sin firma → 401 y no procesa nada', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/ycloud/${TOKEN}`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(PAYLOAD),
    });
    expect(res.statusCode).toBe(401);
    expect(h.enqueueMock).not.toHaveBeenCalled();
  });

  it('enforce + firma inválida (secret equivocado) → 401', async () => {
    const app = await buildApp();
    const body = JSON.stringify(PAYLOAD);
    const { header } = buildYCloudSignatureHeader({ rawBody: body, secret: 'otro_secret' });
    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/ycloud/${TOKEN}`,
      headers: { 'content-type': 'application/json', 'ycloud-signature': header },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('enforce + firma válida → 200 processed (lead + conversación + debounce)', async () => {
    const app = await buildApp();
    const body = JSON.stringify(PAYLOAD);
    const { header } = buildYCloudSignatureHeader({ rawBody: body, secret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/ycloud/${TOKEN}`,
      headers: { 'content-type': 'application/json', 'ycloud-signature': header },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const out = res.json();
    expect(out.ok).toBe(true);
    expect(out.conversationId).toBeGreaterThan(0);
    expect(out.leadId).toBeGreaterThan(0);
    expect(h.enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('warn + firma inválida → continúa y procesa (200)', async () => {
    h.envMock.YCLOUD_WEBHOOK_VERIFY_MODE = 'warn';
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/ycloud/${TOKEN}`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(PAYLOAD),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('token desconocido → 404', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/ycloud/token-inexistente',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(PAYLOAD),
    });
    expect(res.statusCode).toBe(404);
  });

  it('payload malformado (schema) → 400; error de infraestructura → 500', async () => {
    const app = await buildApp();
    const badBody = JSON.stringify({ foo: 'bar' });
    const sig1 = buildYCloudSignatureHeader({ rawBody: badBody, secret: SECRET });
    const res400 = await app.inject({
      method: 'POST',
      url: `/webhooks/ycloud/${TOKEN}`,
      headers: { 'content-type': 'application/json', 'ycloud-signature': sig1.header },
      payload: badBody,
    });
    expect(res400.statusCode).toBe(400);

    // BD que muere en la ingesta (pero no en tenant_tokens/integration_accounts):
    const db = seedDb();
    const realFake = makeFakeSupabase(db) as unknown as { from: (t: string) => unknown };
    h.supabaseRef.current = {
      from(table: string) {
        if (table === 'leads') throw new Error('db down');
        return realFake.from(table);
      },
    };
    const goodBody = JSON.stringify(PAYLOAD);
    const sig2 = buildYCloudSignatureHeader({ rawBody: goodBody, secret: SECRET });
    const res500 = await app.inject({
      method: 'POST',
      url: `/webhooks/ycloud/${TOKEN}`,
      headers: { 'content-type': 'application/json', 'ycloud-signature': sig2.header },
      payload: goodBody,
    });
    expect(res500.statusCode).toBe(500);
  });
});
