import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'vega-hogar-motor',
    env: env.NODE_ENV,
    uptime_ms: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  }));
}
