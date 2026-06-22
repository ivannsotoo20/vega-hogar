import type { ValidationRule } from '../types.js';

const URL_REGEX = /\bhttps?:\/\/\S+/i;

/**
 * Re-domain inmobiliario: en Vega los enlaces (ficha del inmueble, enlace de
 * agenda Cal.com) son NORMALES desde la fase de propuesta/match. Lo que delata
 * spam es soltar un enlace en la apertura (fase 0-1), antes de entender la
 * necesidad. Por eso el umbral baja a fase 2 (vs F4 del setter) y es solo `warn`.
 */
export const V07_linkTooEarly: ValidationRule = {
  id: 'V07',
  description: 'Enlace enviado en la apertura (antes de fase 2)',
  check: (text, ctx) => {
    if (ctx.currentPhase >= 2) return null;
    const m = text.match(URL_REGEX);
    if (!m) return null;
    return {
      ruleId: 'V07',
      description: `URL en fase ${ctx.currentPhase} (recomendado a partir de F2, tras entender la necesidad)`,
      severity: 'warn',
      match: m[0],
      suggestion: 'Posponer el enlace hasta cualificar la necesidad del lead.',
    };
  },
};
