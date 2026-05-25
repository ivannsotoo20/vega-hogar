import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';

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

  await app.register(sensible);
  await app.register(healthRoutes);

  return app;
}
