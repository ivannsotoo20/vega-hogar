/**
 * Detector heurístico tú/usted/ambiguous.
 *
 * Vive en shared-validator porque V18 lo necesita para validar el output del
 * agente contra el modo configurado por la agencia. El motor también lo importa
 * (re-export en `index.ts`) para alimentar la lógica de `mirror_lead` —
 * detectAddressing del último mensaje del lead → directiva dinámica al system
 * prompt turno a turno.
 *
 * **Diseño explícito:**
 *  - Word-boundary Unicode-aware (`\p{L}` / `\p{N}`) para soportar acentos / ñ.
 *  - Hits ponderados: pronombres explícitos (tú/usted) cuentan 2 puntos,
 *    conjugaciones débiles (que pueden ser ambiguas) cuentan 1.
 *  - Si hay hits significativos de ambos lados → 'ambiguous' (salvo diferencia
 *    >2x con markers fuertes del ganador).
 *  - Texto muy corto o sin verbos/pronombres detectables → 'ambiguous'.
 *
 * **Heurística — no NLP perfecto.** Documentado riesgo de falsos positivos.
 * Los fixtures en `apps/motor-agente/test/detect-addressing.test.ts` cubren
 * ~30 casos reales. Si la heurística pierde precisión, considerar degradar V18
 * a warning-only (sin retry).
 */

export type AddressingResult = 'tu' | 'usted' | 'ambiguous';

const STRONG_TU_MARKERS = [
  'tú',
  'tu',
  'te',
  'ti',
  'tuyo',
  'tuya',
  'tuyos',
  'tuyas',
  'contigo',
];

const STRONG_USTED_MARKERS = ['usted', 'ustedes', 'consigo'];

const WEAK_TU_WORDS = [
  'tienes',
  'tenías',
  'tendrás',
  'tuviste',
  'eres',
  'estás',
  'fuiste',
  'estuviste',
  'quieres',
  'puedes',
  'querías',
  'podías',
  'sabes',
  'haces',
  'hiciste',
  'vas',
  'vienes',
  'dices',
  'ves',
  'cuéntame',
  'dime',
  'mira',
  'escucha',
];

const WEAK_USTED_WORDS = [
  'cuénteme',
  'dígame',
  'mire',
  'escuche',
  'tenga',
  'siéntese',
  'pase',
  'venga', // cuidado: interjección coloquial — solo cuenta si hay markers fuertes de usted
];

/**
 * Detecta tratamiento (tú/usted) en un texto en español.
 *
 * @returns 'tu' | 'usted' | 'ambiguous'
 */
export function detectAddressing(text: string): AddressingResult {
  if (typeof text !== 'string') return 'ambiguous';
  const lower = text.toLowerCase();
  if (lower.trim() === '') return 'ambiguous';

  let scoreTu = 0;
  let scoreUsted = 0;

  for (const marker of STRONG_TU_MARKERS) {
    if (containsAsWord(lower, marker)) scoreTu += 2;
  }
  for (const marker of STRONG_USTED_MARKERS) {
    if (containsAsWord(lower, marker)) scoreUsted += 2;
  }

  const hasStrongTu = scoreTu > 0;
  const hasStrongUsted = scoreUsted > 0;

  for (const word of WEAK_TU_WORDS) {
    if (containsAsWord(lower, word)) scoreTu += 1;
  }
  for (const word of WEAK_USTED_WORDS) {
    if (containsAsWord(lower, word)) {
      if (word === 'venga' && !hasStrongUsted) continue;
      scoreUsted += 1;
    }
  }

  if (scoreTu === 0 && scoreUsted === 0) return 'ambiguous';
  if (scoreTu > 0 && scoreUsted > 0) {
    if (scoreTu >= scoreUsted * 2 && hasStrongTu) return 'tu';
    if (scoreUsted >= scoreTu * 2 && hasStrongUsted) return 'usted';
    return 'ambiguous';
  }
  return scoreTu > scoreUsted ? 'tu' : 'usted';
}

function containsAsWord(haystack: string, needle: string): boolean {
  const phraseLen = needle.length;
  let startIdx = 0;
  while (true) {
    const idx = haystack.indexOf(needle, startIdx);
    if (idx === -1) return false;
    const charBefore = idx === 0 ? '' : haystack[idx - 1] ?? '';
    const charAfter = idx + phraseLen >= haystack.length ? '' : haystack[idx + phraseLen] ?? '';
    if (!isWordChar(charBefore) && !isWordChar(charAfter)) return true;
    startIdx = idx + phraseLen;
  }
}

const WORD_CHAR_REGEX = /[\p{L}\p{N}]/u;
function isWordChar(c: string): boolean {
  return c !== '' && WORD_CHAR_REGEX.test(c);
}
