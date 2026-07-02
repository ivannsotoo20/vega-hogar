import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { webhookMockWhatsappRoutes } from './routes/webhook-mock-whatsapp.js';
import { webhookYcloudRoutes } from './routes/webhook-ycloud.js';
import { webhookCalcomRoutes } from './routes/webhook-calcom.js';
import { cronSchedulerPlugin } from './plugins/cron-scheduler.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    disableRequestLogging: env.NODE_ENV === 'production',
    trustProxy: true,
  });

  // Hardening (seguridad dura, CLAUDE.md §10): cabeceras seguras + CORS cerrado.
  // El motor solo recibe webhooks server-to-server + endpoints internos (bearer);
  // no hay clientes de navegador → origin:false rechaza cross-origin del browser.
  await app.register(helmet);
  await app.register(cors, { origin: false });
  await app.register(sensible);

  // Parser JSON que conserva el body crudo en `request.rawBody` (necesario para
  // verificar firmas HMAC de webhooks: Cal.com x-cal-signature, YCloud, etc.).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = typeof body === 'string' ? body : body.toString('utf8');
    (_req as unknown as { rawBody?: string }).rawBody = raw;
    try {
      done(null, raw.length > 0 ? JSON.parse(raw) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(healthRoutes);
  await app.register(webhookMockWhatsappRoutes);
  await app.register(webhookYcloudRoutes);
  await app.register(webhookCalcomRoutes);

  // Cron del motor (debounce-tick → process-debounced). Gated OFF por defecto.
  await app.register(cronSchedulerPlugin);

  // Seguridad §10: en producción con canal real, la verificación HMAC en modo
  // distinto de `enforce` deja el webhook abierto a inyección de mensajes falsos
  // (gasto de LLM + envíos reales). Aviso ruidoso — `warn` solo es aceptable
  // transitoriamente durante la validación inicial de firmas del go-live.
  if (env.NODE_ENV === 'production') {
    if (env.WHATSAPP_PROVIDER === 'ycloud' && env.YCLOUD_WEBHOOK_VERIFY_MODE !== 'enforce') {
      app.log.error(
        { mode: env.YCLOUD_WEBHOOK_VERIFY_MODE },
        '⚠ SEGURIDAD: WHATSAPP_PROVIDER=ycloud en producción SIN YCLOUD_WEBHOOK_VERIFY_MODE=enforce — el webhook acepta mensajes sin firma válida',
      );
    }
    if (env.CALENDAR_PROVIDER === 'calcom' && env.CALCOM_WEBHOOK_VERIFY_MODE !== 'enforce') {
      app.log.error(
        { mode: env.CALCOM_WEBHOOK_VERIFY_MODE },
        '⚠ SEGURIDAD: CALENDAR_PROVIDER=calcom en producción SIN CALCOM_WEBHOOK_VERIFY_MODE=enforce',
      );
    }
  }

  return app;
}
