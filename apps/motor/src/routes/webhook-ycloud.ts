import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import type { Database } from '@vega-hogar/db';
import { parseYCloudInbound } from '@vega-hogar/channel-adapters';
import { env } from '../config/env.js';
import { getSupabase } from '../lib/supabase.js';
import { getRedis, tryClaimDedupKey, releaseDedupKey } from '../lib/redis.js';
import { enqueueDebounce } from '../lib/debounce-buffer.js';
import { safeLogBody } from '../lib/log-redact.js';
import { verifyYCloudSignature } from '../lib/webhook-verify.js';
import {
  resolveTenantByToken,
  upsertLead,
  getOrCreateConversation,
  insertInboundMessage,
} from '../services/lead-ingest.js';
import { loadKeywords, classifyInbound } from '../services/keywords.js';

/**
 * Webhook REAL de YCloud (go-live). `POST /webhooks/ycloud/:tenant_token`.
 *
 * Espejo de `webhook-mock-whatsapp.ts` (ingesta) + `webhook-calcom.ts` (verify/dedup):
 *   1. resolveTenantByToken (purpose `ycloud_webhook`).
 *   2. Verifica firma `YCloud-Signature: t=<ts>,s=<hmac>` (HMAC-SHA256 de `{ts}.{rawBody}`)
 *      según `YCLOUD_WEBHOOK_VERIFY_MODE` (disabled|warn|enforce → 401).
 *   3. parseYCloudInbound → status updates se ack-ean sin procesar.
 *   4. Dedup redis por dedupKey del parser (wamid).
 *   5. lead-ingest (upsert por tenant+phone E.164) → keywords → debounce → cron.
 *
 * `safeLogBody` en todos los logs (§10). Multimodal (audio/imagen sin texto) se
 * ack-ea sin pipeline — la transcripción es F12+.
 */

const DEFAULT_DEBOUNCE_SECONDS = 25;
const DEDUP_TTL_SECONDS = 600;

export type YCloudProcessResult =
  | { kind: 'ignored'; reason: string }
  | { kind: 'deduped' }
  | { kind: 'processed'; conversationId: number; leadId: number };

export interface YCloudProcessDeps {
  supabase: SupabaseClient<Database>;
  /** tryClaimDedupKey inyectable (tests). true = clave nueva (no duplicado). */
  claimDedup: (key: string, ttlSeconds?: number) => Promise<boolean>;
  /** Libera la clave dedup si la ingesta falla tras reclamarla (best-effort). */
  releaseDedup: (key: string) => Promise<void>;
  /** enqueueDebounce inyectable (tests). */
  enqueue: (conversationId: number, debounceSeconds: number) => Promise<unknown>;
}

/**
 * wa_id de YCloud viene SIN `+` (p.ej. `34600111222`). Normaliza a E.164 con `+`
 * y valida longitud (8-15 dígitos, ITU-T E.164). Devuelve null si no es usable.
 */
export function normalizeWaIdToE164(waId: string | undefined | null): string | null {
  const digits = (waId ?? '').replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/**
 * Núcleo procesable del webhook (exportado para tests con fakes).
 * Lanza si el payload no cumple el schema zod del parser (caller → 400).
 */
export async function processYCloudInbound(
  deps: YCloudProcessDeps,
  tenantId: number,
  body: unknown,
): Promise<YCloudProcessResult> {
  const { supabase } = deps;
  const parsed = parseYCloudInbound(body, tenantId);

  if (parsed.isStatusUpdate) return { kind: 'ignored', reason: 'status_update' };
  if (!parsed.message) return { kind: 'ignored', reason: 'no_message' };

  const msg = parsed.message;
  const text = (msg.text ?? '').trim();
  if (!text) return { kind: 'ignored', reason: 'sin_texto' };

  const phone = normalizeWaIdToE164(msg.externalUserId);
  if (!phone) return { kind: 'ignored', reason: 'telefono_invalido' };

  // Dedup por wamid ANTES de escribir (reintentos/entregas dobles de YCloud).
  const dedupKey = parsed.dedupKey ? `ycloud:${tenantId}:${parsed.dedupKey}` : null;
  if (dedupKey) {
    const fresh = await deps.claimDedup(dedupKey, DEDUP_TTL_SECONDS);
    if (!fresh) return { kind: 'deduped' };
  }

  try {
    const raw = (msg.rawPayload ?? {}) as Record<string, unknown>;
    const contactName = typeof raw.contactName === 'string' ? raw.contactName : null;
    const externalMsgId =
      parsed.dedupKey?.startsWith('ycloud-msg:') === true
        ? parsed.dedupKey.slice('ycloud-msg:'.length)
        : null;

    // Ingesta (sin tabla channels: upsert por tenant+phone) — espejo del mock.
    const { leadId } = await upsertLead({ supabase, tenantId, phone, channel: 'whatsapp', fullName: contactName });
    const { conversationId } = await getOrCreateConversation({ supabase, tenantId, leadId, channel: 'whatsapp' });
    await insertInboundMessage({ supabase, tenantId, conversationId, content: text, externalMsgId });

    // Clasificar inbound → conversation_source si matchea keyword (best-effort).
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
    await deps.enqueue(conversationId, debounceSeconds);

    return { kind: 'processed', conversationId, leadId };
  } catch (err) {
    // La ingesta falló DESPUÉS de reclamar el dedup: liberar la clave para que
    // el reintento de YCloud NO se responda como "deduped" (perdería el mensaje
    // para siempre — preferimos un duplicado raro a perder un WhatsApp del lead).
    if (dedupKey) await deps.releaseDedup(dedupKey);
    throw err;
  }
}

export async function webhookYcloudRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/ycloud/:tenant_token', async (request, reply) => {
    const { tenant_token } = request.params as { tenant_token: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    app.log.debug({ body: safeLogBody(body) }, '[webhook-ycloud] inbound');

    const supabase = getSupabase();
    const tenant = await resolveTenantByToken(supabase, tenant_token, 'ycloud_webhook');
    if (!tenant) return reply.code(404).send({ error: 'tenant token not found' });
    const tenantId = tenant.tenantId;

    // Verificación de firma HMAC `YCloud-Signature` (modo por env) — espejo calcom.
    const verifyMode = env.YCLOUD_WEBHOOK_VERIFY_MODE;
    if (verifyMode !== 'disabled') {
      const { data: ia } = await supabase
        .from('integration_accounts')
        .select('webhook_secret')
        .eq('tenant_id', tenantId)
        .eq('provider', 'ycloud')
        .eq('active', true)
        .limit(1)
        .maybeSingle();
      const secret = (ia?.webhook_secret as string | null) ?? '';
      const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(body);
      const sigHeader = request.headers['ycloud-signature'] as string | undefined;
      const res = verifyYCloudSignature({ rawBody, signatureHeader: sigHeader, secret });
      if (!res.ok) {
        if (verifyMode === 'enforce') {
          app.log.warn({ reason: res.reason, tenantId }, '[webhook-ycloud] firma inválida → 401 (enforce)');
          return reply.code(401).send({ error: 'invalid signature' });
        }
        app.log.warn({ reason: res.reason, tenantId }, '[webhook-ycloud] firma inválida (warn — continúa)');
      }
    }

    let result: YCloudProcessResult;
    try {
      result = await processYCloudInbound(
        {
          supabase,
          claimDedup: tryClaimDedupKey,
          releaseDedup: releaseDedupKey,
          enqueue: (conversationId, seconds) => enqueueDebounce(getRedis(), conversationId, seconds),
        },
        tenantId,
        body,
      );
    } catch (err) {
      // Solo el payload malformado (schema zod del parser) es un 400 del emisor.
      // Fallos de BD/Redis son NUESTROS → rethrow (500) para que YCloud reintente.
      if (err instanceof ZodError) {
        app.log.warn({ tenantId, issues: err.issues.length }, '[webhook-ycloud] payload inválido (schema)');
        return reply.code(400).send({ error: 'invalid payload' });
      }
      app.log.error(
        { err: err instanceof Error ? err.message : String(err), tenantId },
        '[webhook-ycloud] ingesta falló (dedup liberado; YCloud reintentará)',
      );
      throw err;
    }

    if (result.kind === 'deduped') return reply.code(200).send({ ok: true, deduped: true });
    if (result.kind === 'ignored') return reply.code(200).send({ ok: true, ignored: result.reason });
    return reply.code(200).send({ ok: true, conversationId: result.conversationId, leadId: result.leadId });
  });
}

async function loadDebounceWindow(
  supabase: SupabaseClient<Database>,
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
