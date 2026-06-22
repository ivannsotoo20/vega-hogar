import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    client.on('error', (err: Error) => {
      // No reventamos el proceso: fallback graceful (dedup se desactiva en la ruta).
      // eslint-disable-next-line no-console
      console.error('[redis] error', err.message);
    });
  }
  return client;
}

/**
 * Intenta reservar una clave única para deduplicación.
 * Devuelve true si la clave era nueva (se persistió), false si ya existía (duplicado).
 * TTL por defecto 60s — suficiente para cubrir reintentos inmediatos del webhook (YCloud/mock).
 */
export async function tryClaimDedupKey(key: string, ttlSeconds = 60): Promise<boolean> {
  try {
    const redis = getRedis();
    const res = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  } catch (err) {
    // Si Redis no responde, no deduplicamos (preferimos duplicados a perder mensajes).
    // eslint-disable-next-line no-console
    console.warn('[redis] dedup skipped', (err as Error).message);
    return true;
  }
}
