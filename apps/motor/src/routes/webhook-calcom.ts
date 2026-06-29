import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { getSupabase } from '../lib/supabase.js';
import { tryClaimDedupKey } from '../lib/redis.js';
import { safeLogBody } from '../lib/log-redact.js';
import { verifyCalcomSignature } from '../lib/calcom-verify.js';
import { resolveTenantByToken } from '../services/lead-ingest.js';
import { matchLeadFromCalcom, type CalcomBooking } from '../services/appointment-matcher.js';
import { applyCalcomAppointment, type CalcomEventType } from '../services/appointment-applier.js';

/**
 * Webhook de Cal.com (F10c, gated). `POST /webhooks/calcom/:tenant_token`.
 * Verifica firma `x-cal-signature-256` (HMAC) según `CALCOM_WEBHOOK_VERIFY_MODE`
 * (disabled|warn|enforce) → parse → match lead → applier (espejo + conversación).
 * `safeLogBody` en logs. Codeado + gated: no se ejercita hasta el go-live de Cal.com.
 */

const TRIGGER_MAP: Record<string, CalcomEventType> = {
  BOOKING_CREATED: 'created',
  BOOKING_REQUESTED: 'created',
  BOOKING_RESCHEDULED: 'rescheduled',
  BOOKING_CANCELLED: 'cancelled',
};

export async function webhookCalcomRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/calcom/:tenant_token', async (request, reply) => {
    const { tenant_token } = request.params as { tenant_token: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    app.log.debug({ body: safeLogBody(body) }, '[webhook-calcom] inbound');

    const supabase = getSupabase();
    const tenant = await resolveTenantByToken(supabase, tenant_token, 'calcom_webhook');
    if (!tenant) return reply.code(404).send({ error: 'tenant token not found' });
    const tenantId = tenant.tenantId;

    // Verificación de firma HMAC (modo por env).
    const verifyMode = env.CALCOM_WEBHOOK_VERIFY_MODE;
    if (verifyMode !== 'disabled') {
      const { data: ia } = await supabase
        .from('integration_accounts')
        .select('webhook_secret')
        .eq('tenant_id', tenantId)
        .eq('provider', 'cal_com')
        .eq('active', true)
        .limit(1)
        .maybeSingle();
      const secret = (ia?.webhook_secret as string | null) ?? '';
      const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(body);
      const sigHeader = request.headers['x-cal-signature-256'] as string | undefined;
      const res = verifyCalcomSignature({ rawBody, signatureHeader: sigHeader, secret });
      if (!res.ok) {
        if (verifyMode === 'enforce') {
          app.log.warn({ reason: res.reason, tenantId }, '[webhook-calcom] firma inválida → 401 (enforce)');
          return reply.code(401).send({ error: 'invalid signature' });
        }
        app.log.warn({ reason: res.reason, tenantId }, '[webhook-calcom] firma inválida (warn — continúa)');
      }
    }

    // Parse + normalización del payload Cal.com.
    const triggerEvent = String(body.triggerEvent ?? '');
    const eventType = TRIGGER_MAP[triggerEvent];
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    const booking = normalizeBooking(payload);
    if (!eventType || !booking) {
      return reply.code(200).send({ ok: true, ignored: true, reason: 'evento/payload no soportado' });
    }

    // Dedup (redis) por uid + evento.
    const fresh = await tryClaimDedupKey(`calcom:${tenantId}:${booking.uid}:${triggerEvent}`, 600);
    if (!fresh) return reply.code(200).send({ ok: true, deduped: true });

    // Resolver calendar_account por defecto (para el espejo).
    const { data: cal } = await supabase
      .from('calendar_accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (!cal) return reply.code(200).send({ ok: true, ignored: true, reason: 'sin calendar_account' });

    const match = await matchLeadFromCalcom({ supabase, tenantId, booking });
    const applied = await applyCalcomAppointment({
      supabase,
      tenantId,
      calendarAccountId: Number(cal.id),
      booking,
      eventType,
      match,
    });

    return reply.code(200).send({
      ok: true,
      eventType,
      matchMethod: match.method,
      conversationMoved: applied.conversationMoved,
      revoked: applied.revoked,
    });
  });
}

function normalizeBooking(p: Record<string, unknown>): CalcomBooking | null {
  const uid = typeof p.uid === 'string' ? p.uid : null;
  const startTime = typeof p.startTime === 'string' ? p.startTime : null;
  if (!uid || !startTime) return null;
  const endTime = typeof p.endTime === 'string' ? p.endTime : startTime;
  const attendeesRaw = Array.isArray(p.attendees) ? p.attendees : [];
  const attendees = attendeesRaw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a) => ({
      name: typeof a.name === 'string' ? a.name : undefined,
      email: typeof a.email === 'string' ? a.email : undefined,
      timeZone: typeof a.timeZone === 'string' ? a.timeZone : undefined,
    }));
  return {
    uid,
    startTime,
    endTime,
    status: typeof p.status === 'string' ? p.status : 'confirmed',
    title: typeof p.title === 'string' ? p.title : null,
    attendees,
    metadata: (p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : null),
  };
}
