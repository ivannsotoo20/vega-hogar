import type { FastifyInstance } from 'fastify';
import { getSupabase } from '../lib/supabase.js';
import { getRedis, tryClaimDedupKey } from '../lib/redis.js';
import { enqueueDebounce } from '../lib/debounce-buffer.js';
import { safeLogBody } from '../lib/log-redact.js';
import {
  resolveTenantByToken,
  upsertLead,
  getOrCreateConversation,
  insertInboundMessage,
} from '../services/lead-ingest.js';
import { loadKeywords, classifyInbound } from '../services/keywords.js';

/**
 * Webhook MOCK de WhatsApp (driver simulado, F10b). Payload simple
 * `{ phone, text, name?, external_msg_id? }` → lead-ingest → debounce (redis) →
 * lo procesa el cron debounce-tick. HMAC en modo `log` (sin secreto real; el
 * verify HMAC real es del webhook YCloud, F10c). `safeLogBody` en logs.
 *
 * El simulador del panel / harness local postea aquí. NO es feature de prod.
 */

const DEFAULT_DEBOUNCE_SECONDS = 25;

interface MockInboundBody {
  phone?: string;
  text?: string;
  name?: string;
  external_msg_id?: string;
}

export async function webhookMockWhatsappRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/whatsapp-mock/:tenant_token', async (request, reply) => {
    const { tenant_token } = request.params as { tenant_token: string };
    const body = (request.body ?? {}) as MockInboundBody;
    app.log.debug({ body: safeLogBody(body) }, '[webhook-mock-whatsapp] inbound');

    const phone = (body.phone ?? '').trim();
    const text = (body.text ?? '').trim();
    if (!phone || !text) {
      return reply.code(400).send({ error: 'phone and text required' });
    }

    const supabase = getSupabase();
    const tenant = await resolveTenantByToken(supabase, tenant_token, 'whatsapp_mock');
    if (!tenant) return reply.code(404).send({ error: 'tenant token not found' });
    const tenantId = tenant.tenantId;

    // Dedup best-effort por external_msg_id (si viene).
    if (body.external_msg_id) {
      const fresh = await tryClaimDedupKey(`mockwa:${tenantId}:${body.external_msg_id}`);
      if (!fresh) return reply.code(200).send({ ok: true, deduped: true });
    }

    // Ingesta (sin tabla channels: upsert por tenant+phone).
    const { leadId } = await upsertLead({ supabase, tenantId, phone, channel: 'whatsapp', fullName: body.name ?? null });
    const { conversationId } = await getOrCreateConversation({ supabase, tenantId, leadId, channel: 'whatsapp' });
    await insertInboundMessage({
      supabase,
      tenantId,
      conversationId,
      content: text,
      externalMsgId: body.external_msg_id ?? null,
    });

    // Clasificar inbound → set conversation_source si matchea un keyword (best-effort).
    try {
      const source = classifyInbound(text, await loadKeywords(supabase, tenantId));
      if (source) {
        await supabase.from('conversations').update({ conversation_source: source }).eq('id', conversationId);
      }
    } catch {
      /* best-effort: la clasificación no bloquea la ingesta */
    }

    // Debounce → el cron debounce-tick disparará process-debounced.
    const debounceSeconds = await loadDebounceWindow(supabase, tenantId);
    await enqueueDebounce(getRedis(), conversationId, debounceSeconds);

    return reply.code(200).send({ ok: true, conversationId, leadId });
  });
}

async function loadDebounceWindow(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: number,
): Promise<number> {
  const { data } = await supabase
    .from('tenant_configs')
    .select('debounce_window_seconds')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const v = Number(data?.debounce_window_seconds);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DEBOUNCE_SECONDS;
}
