/**
 * Buffer de debounce por conversación usando Redis sorted sets.
 *
 * Para cada conversación con mensajes inbound recientes mantenemos UNA entrada
 * en el sorted set `DEBOUNCE_KEY` con `score = expires_at_ms`.
 *
 * Cuando llega un nuevo mensaje del lead, llamamos `enqueueDebounce` que
 * (re)escribe la entrada con `expires_at = now + debounceWindowSeconds`. El cron
 * `getExpiredDebounces(now)` devuelve los conversation_ids cuyo timer venció.
 *
 * El score se actualiza con cada mensaje → "extiende" automáticamente la ventana.
 *
 * Persistencia: Redis sobrevive a reinicios del motor. Si el cron está caído y
 * los timers vencen, al volver el cron procesa todos los retrasados de golpe.
 */
import type { Redis } from 'ioredis';

const DEBOUNCE_KEY = 'vega:debounce:conversations';

export interface DebounceEntry {
  conversationId: number;
  expiresAtMs: number;
}

/**
 * Encola o extiende el debounce para una conversación.
 * Si ya existía una entrada, la sobrescribe con el nuevo `expires_at`.
 */
export async function enqueueDebounce(
  redis: Redis,
  conversationId: number,
  debounceWindowSeconds: number,
): Promise<DebounceEntry> {
  const expiresAtMs = Date.now() + debounceWindowSeconds * 1000;
  await redis.zadd(DEBOUNCE_KEY, expiresAtMs, String(conversationId));
  return { conversationId, expiresAtMs };
}

/**
 * Devuelve las conversaciones cuyo timer ya venció (score <= nowMs).
 * NO las elimina; el caller debe llamar `dropDebounce` tras procesar.
 */
export async function getExpiredDebounces(
  redis: Redis,
  nowMs: number = Date.now(),
  limit = 50,
): Promise<DebounceEntry[]> {
  const results = await redis.zrangebyscore(
    DEBOUNCE_KEY,
    0,
    nowMs,
    'WITHSCORES',
    'LIMIT',
    0,
    limit,
  );
  const out: DebounceEntry[] = [];
  for (let i = 0; i < results.length; i += 2) {
    const cid = results[i];
    const score = results[i + 1];
    if (cid != null && score != null) {
      out.push({ conversationId: Number(cid), expiresAtMs: Number(score) });
    }
  }
  return out;
}

/**
 * Elimina la entrada de debounce de una conversación tras procesarla.
 * Idempotente.
 */
export async function dropDebounce(redis: Redis, conversationId: number): Promise<void> {
  await redis.zrem(DEBOUNCE_KEY, String(conversationId));
}

/**
 * Elimina TODAS las entradas (solo para tests / scripts admin).
 */
export async function clearAllDebounces(redis: Redis): Promise<void> {
  await redis.del(DEBOUNCE_KEY);
}

/**
 * Cuenta cuantas conversaciones hay esperando proceso (informativo).
 */
export async function pendingDebouncesCount(redis: Redis): Promise<number> {
  return redis.zcard(DEBOUNCE_KEY);
}

/**
 * Devuelve la primera conversación cuyo timer aún NO venció (debug).
 */
export async function peekNextDebounce(redis: Redis): Promise<DebounceEntry | null> {
  const res = await redis.zrange(DEBOUNCE_KEY, 0, 0, 'WITHSCORES');
  if (res.length < 2) return null;
  const cid = res[0];
  const score = res[1];
  if (cid == null || score == null) return null;
  return { conversationId: Number(cid), expiresAtMs: Number(score) };
}

export const DEBOUNCE_REDIS_KEY = DEBOUNCE_KEY;
