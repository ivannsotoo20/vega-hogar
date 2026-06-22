/**
 * Log redaction helpers (seguridad dura, CLAUDE.md §10).
 *
 * El motor loggea `body: request.body` en webhooks para debug. Los payloads
 * pueden traer secretos (api keys del tenant, webhook secrets, tokens). Antes de
 * loggear, sustituimos esas claves por '<REDACTED>'.
 *
 * Lista de keys redactadas: cualquiera que matchee (case-insensitive) los
 * patrones de SECRET_KEY_PATTERNS. La detección es por substring, no exacto
 * (e.g. 'access_token' / 'accessToken' / 'AccessTokenExpiresAt' todos matchean).
 */

const SECRET_KEY_PATTERNS = [
  'token',
  'secret',
  'apikey',
  'api_key',
  'apitoken',
  'api_token',
  'password',
  'authorization',
  'credentials',
  'private_key',
  'privatekey',
  'refresh_token',
  'access_token',
  'webhook_secret',
];

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Recursivamente devuelve una copia del body con valores sensibles reemplazados
 * por '<REDACTED>'. Soporta objetos planos, arrays y primitivos. NO modifica el
 * input. Limitado a 6 niveles de profundidad para evitar payloads circulares
 * (Fastify request bodies no deberían serlo, pero defensivo).
 */
export function safeLogBody(value: unknown, depth = 0): unknown {
  if (depth > 6) return '<TRUNCATED depth>';
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => safeLogBody(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) {
        out[k] = '<REDACTED>';
      } else {
        out[k] = safeLogBody(v, depth + 1);
      }
    }
    return out;
  }
  return '<unserializable>';
}

/** Helper alternativo: devuelve solo las keys del body (sin valores). */
export function bodyKeys(value: unknown): string[] {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>);
}
