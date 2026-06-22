import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { getSupabase } from '../lib/supabase.js';
import { getRedis } from '../lib/redis.js';

const startedAt = Date.now();

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function checkRedis(): Promise<boolean> {
  try {
    return (await withTimeout(getRedis().ping(), 2000)) === 'PONG';
  } catch {
    return false;
  }
}

async function checkSupabase(): Promise<boolean> {
  try {
    const { error } = await withTimeout(
      getSupabase().from('tenants').select('id', { head: true, count: 'exact' }),
      2500,
    );
    return !error;
  } catch {
    return false;
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const [redis, supabase] = await Promise.all([checkRedis(), checkSupabase()]);
    const ok = redis && supabase;
    return {
      status: ok ? 'ok' : 'degraded',
      service: 'vega-hogar-motor',
      env: env.NODE_ENV,
      checks: { redis, supabase },
      uptime_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  });
}
