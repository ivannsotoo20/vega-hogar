import type { ValidationRule } from '../types.js';

const MAX_CHARS_PER_MESSAGE = 280;

/**
 * Esta regla evalúa el mensaje COMPLETO del bot (post-Judge, pre-Splitter).
 * Si supera el umbral, el Splitter debe partirlo. Marca warn — no bloquea.
 *
 * Para mensajes ya partidos por el Splitter, esta regla se ejecuta sobre cada parte
 * y hace warn si alguna parte supera el límite.
 */
export const V03_length: ValidationRule = {
  id: 'V03',
  description: `Longitud excesiva (>${MAX_CHARS_PER_MESSAGE} chars)`,
  check: (text) => {
    if (text.length <= MAX_CHARS_PER_MESSAGE) return null;

    return {
      ruleId: 'V03',
      description: `Mensaje de ${text.length} chars supera límite ${MAX_CHARS_PER_MESSAGE}`,
      severity: 'warn',
      match: text.slice(0, 60) + '...',
      suggestion: 'Pasar por Splitter para partir en mensajes ≤280 chars.',
    };
  },
};
