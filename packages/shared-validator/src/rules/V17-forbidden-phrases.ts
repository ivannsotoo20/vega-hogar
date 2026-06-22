import type { ValidationRule } from '../types.js';

/**
 * V17 — Vocabulario prohibido de la agencia.
 *
 * La agencia configura una lista de palabras/frases que el agente NUNCA debe
 * usar (en `agencia_preferences.preferences.forbiddenPhrases`). Cumplimiento
 * ESTRICTO: el orquestador del pipeline detecta este ruleId específicamente
 * y dispara 1 retry al Generator con instrucción enriquecida.
 *
 * Detección: word-boundary match case-insensitive, Unicode-aware (`\p{L}` /
 * `\p{N}`) para soportar acentos y ñ. NO fuzzy — `genial` matchea "Genial!"
 * pero NO "genialmente" (la "m" detrás extiende la palabra). Diseño explícito
 * para evitar falsos positivos.
 *
 * Severidad: 'warn'. La regla no bloquea el flujo por sí sola — el motor
 * decide si reintenta o degrada grácilmente. Esto permite separar "detectar"
 * de "actuar", manteniendo coherencia con V01/V02/V12 (también warn).
 *
 * Pre-condición: las frases en `ctx.forbiddenPhrases` deben venir ya
 * sanitizadas (trim + lowercase) — el caller usa `parseAgenciaPreferences`
 * que se encarga. La regla normaliza igualmente para defensa en profundidad.
 */
export const V17_forbiddenPhrases: ValidationRule = {
  id: 'V17',
  description: 'Palabra o frase prohibida por la agencia',
  check: (text, ctx) => {
    const list = ctx.forbiddenPhrases;
    if (!list || list.length === 0) return null;

    const offenders: string[] = [];
    for (const phrase of list) {
      const normalized = phrase.trim().toLowerCase();
      if (normalized === '') continue;
      if (containsAsWord(text, normalized)) {
        offenders.push(normalized);
      }
    }
    if (offenders.length === 0) return null;

    // Dedup en caso de que parser legacy haya colado duplicates (defensa extra).
    const uniqueOffenders = [...new Set(offenders)];
    return {
      ruleId: 'V17',
      description: `Palabra(s)/frase(s) prohibida(s) detectada(s): ${uniqueOffenders.map((p) => `"${p}"`).join(', ')}`,
      severity: 'warn',
      match: uniqueOffenders.join('|'),
      suggestion: `Reescribe sin usar: ${uniqueOffenders.map((p) => `"${p}"`).join(', ')}.`,
    };
  },
};

/**
 * Devuelve true si `needle` (ya lowercase) aparece en `haystack` como palabra
 * completa — el char inmediatamente antes y después debe NO ser letra/dígito
 * Unicode (o ser principio/fin de cadena).
 *
 * Usa `\p{L}` (letras Unicode, incluye acentos y ñ) y `\p{N}` (dígitos). Esto
 * resuelve el problema de los \b ASCII-only del regex JS estándar.
 */
function containsAsWord(haystack: string, needle: string): boolean {
  const lowerHaystack = haystack.toLowerCase();
  const phraseLen = needle.length;
  let startIdx = 0;
  while (true) {
    const idx = lowerHaystack.indexOf(needle, startIdx);
    if (idx === -1) return false;
    const charBefore = idx === 0 ? '' : lowerHaystack[idx - 1] ?? '';
    const charAfter =
      idx + phraseLen >= lowerHaystack.length ? '' : lowerHaystack[idx + phraseLen] ?? '';
    if (!isWordChar(charBefore) && !isWordChar(charAfter)) return true;
    startIdx = idx + phraseLen;
  }
}

const WORD_CHAR_REGEX = /[\p{L}\p{N}]/u;
function isWordChar(c: string): boolean {
  return c !== '' && WORD_CHAR_REGEX.test(c);
}
