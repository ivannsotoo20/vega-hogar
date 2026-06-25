import type { FastifyInstance } from 'fastify';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import type { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { getSupabase } from '../lib/supabase.js';
import { getAnthropic } from '../lib/anthropic.js';
import { getRedis } from '../lib/redis.js';
import { getExpiredDebounces, dropDebounce } from '../lib/debounce-buffer.js';
import { processDebounced } from '../services/process-debounced.js';
import { logger } from '../lib/logger.js';

/**
 * Cron del motor (F10b): debounce-tick que procesa las conversaciones cuyo timer
 * de debounce venció → `processDebounced`. **Gated OFF por defecto**
 * (`MOTOR_CRON_ENABLED`); el golden path local y el go-live del VPS lo activan.
 *
 * `runDebounceTick` es testeable (inyecta `process` + fake redis). El outbound-tick
 * del proveedor real + `message_schedules` se difieren a F10c (lean).
 */

const DEBOUNCE_TICK_MS = 3000;

export interface DebounceTickDeps {
  supabase: SupabaseClient<Database>;
  anthropic: Anthropic;
  redis: Redis;
  /** Inyectable para tests. Por defecto `processDebounced`. */
  process?: (conversationId: number) => Promise<unknown>;
}

export async function runDebounceTick(deps: DebounceTickDeps): Promise<{ processed: number }> {
  const runProcess =
    deps.process ?? ((id: number) => processDebounced({ supabase: deps.supabase, anthropic: deps.anthropic }, id));

  const expired = await getExpiredDebounces(deps.redis);
  let processed = 0;
  for (const entry of expired) {
    // Drop ANTES de procesar (anti-race: que otro tick no lo recoja en paralelo).
    await dropDebounce(deps.redis, entry.conversationId);
    try {
      await runProcess(entry.conversationId);
      processed++;
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), conversationId: entry.conversationId },
        '[cron] processDebounced failed',
      );
    }
  }
  return { processed };
}

export async function cronSchedulerPlugin(app: FastifyInstance): Promise<void> {
  if (!env.MOTOR_CRON_ENABLED) {
    app.log.info('[cron] disabled (MOTOR_CRON_ENABLED=false)');
    return;
  }
  const deps: DebounceTickDeps = { supabase: getSupabase(), anthropic: getAnthropic(), redis: getRedis() };
  const timer = setInterval(() => {
    void runDebounceTick(deps).catch((err) => app.log.error({ err }, '[cron] debounce-tick threw'));
  }, DEBOUNCE_TICK_MS);
  app.addHook('onClose', async () => {
    clearInterval(timer);
  });
  app.log.info(`[cron] debounce-tick enabled (every ${DEBOUNCE_TICK_MS}ms)`);
}
