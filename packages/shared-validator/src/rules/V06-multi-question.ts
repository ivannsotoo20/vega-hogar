import type { ValidationRule } from '../types.js';

/**
 * Cuenta los signos de interrogación de cierre `?` (separadores de preguntas).
 * Si hay > 1, hay multi-pregunta. Tolerancia de 1 (las españolas usan `¿...?`).
 *
 * NOTA: si el bot escribe "¿X? ¿Y?" eso son DOS preguntas en un turno → warn.
 * Si escribe "¿X o Y?" eso es UNA pregunta → ok.
 */
export const V06_multiQuestion: ValidationRule = {
  id: 'V06',
  description: 'Pregunta múltiple en un solo turno',
  check: (text) => {
    const closingQuestionMarks = (text.match(/\?/g) || []).length;
    if (closingQuestionMarks <= 1) return null;

    return {
      ruleId: 'V06',
      description: `${closingQuestionMarks} preguntas en un solo turno (máx 1)`,
      severity: 'warn',
      match: text.slice(0, 80) + (text.length > 80 ? '...' : ''),
      suggestion: 'Reducir a UNA pregunta por turno. La regla de la agencia es "una pregunta a la vez".',
    };
  },
};
