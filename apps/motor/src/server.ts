import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { webhookMockWhatsappRoutes } from './routes/webhook-mock-whatsapp.js';
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
  await app.register(healthRoutes);
  await app.register(webhookMockWhatsappRoutes);

  // Cron del motor (debounce-tick → process-debounced). Gated OFF por defecto.
  await app.register(cronSchedulerPlugin);

  return app;
}
