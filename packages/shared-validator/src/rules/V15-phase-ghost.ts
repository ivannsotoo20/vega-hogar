import type { ValidationRule } from '../types.js';

/**
 * Detecta si la fase activa está fuera del rango esperado (0..7 en Vega,
 * catálogo `phases`). NO valida el texto sino el contexto: si el motor marca una
 * fase fantasma, se loggea como error (probable bug del Generator en phase_decision).
 */
export const V15_phaseGhost: ValidationRule = {
  id: 'V15',
  description: 'Fase fantasma fuera de rango 0..7',
  check: (_text, ctx) => {
    if (Number.isInteger(ctx.currentPhase) && ctx.currentPhase >= 0 && ctx.currentPhase <= 7) {
      return null;
    }
    return {
      ruleId: 'V15',
      description: `currentPhase=${ctx.currentPhase} fuera de rango 0..7`,
      severity: 'error',
      suggestion: 'Forzar fase válida. Probable bug en el Generator que devolvió phase_decision incorrecta.',
    };
  },
};
