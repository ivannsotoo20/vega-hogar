/**
 * Helper para detectar si la IA está pausada en una conversación, leyendo
 * `conversations.ai_paused_until` del row Supabase.
 *
 * PostgreSQL acepta `'infinity'` como valor TIMESTAMPTZ para pausa permanente,
 * pero `new Date('infinity')` en JavaScript devuelve `Invalid Date` (NaN). Este
 * helper lo maneja correctamente:
 *   - null / undefined / '' → false (IA activa).
 *   - 'infinity' literal → true (pausa permanente).
 *   - '-infinity' → false (IA activa).
 *   - ISO timestamp futuro → true.
 *   - ISO timestamp pasado → false.
 *   - Cualquier valor no parseable → true (fail-safe: si el motor no entiende el
 *     valor, asume pausa para evitar disparar IA accidentalmente).
 *
 * Replica la lógica del panel (`components/.../format-helpers.ts:isAiPaused`).
 */
export function isAiPausedFromDb(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined || raw === '') return false;
  if (raw === 'infinity') return true;
  if (raw === '-infinity') return false;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return true;
  return ts > Date.now();
}
