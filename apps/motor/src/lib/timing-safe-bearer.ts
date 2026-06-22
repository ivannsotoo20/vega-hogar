import { timingSafeEqual } from 'node:crypto';

/**
 * Comparación constant-time de Bearer tokens (seguridad dura, CLAUDE.md §10).
 *
 * Reemplaza el patrón `provided !== expected` (vulnerable a timing oracle) en
 * los endpoints `/internal/*`. `crypto.timingSafeEqual` requiere buffers de la
 * misma longitud — si no coinciden devolvemos false directo (la longitud no es
 * secreta).
 */
export function isValidBearer(provided: string, expected: string): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (provided.length !== expected.length || expected.length === 0) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Extrae el bearer token del header Authorization (caso-insensible al prefix
 * 'Bearer '). Devuelve null si no presente / mal formado.
 */
export function extractBearer(authHeader: string | string[] | undefined): string | null {
  if (typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}
