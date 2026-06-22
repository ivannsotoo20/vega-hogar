import type { ValidationRule } from '../types.js';

const GOODBYE_PATTERNS = [
  /\bun\s+placer\s+(haberte|hablar)\b/i,
  /\bnos\s+vemos\s+(en\s+otra|pronto|cuando)\b/i,
  /\bun\s+saludo\b/i,
  /\bque\s+tengas\s+(buen|buena)\b/i,
  /\bhasta\s+(luego|pronto|otra)\b/i,
  /\badi[oó]s\b/i,
];

export const V05_prematureGoodbye: ValidationRule = {
  id: 'V05',
  description: 'Despedida prematura antes de F5 / cualificación',
  check: (text, ctx) => {
    // Permitir despedidas a partir de F5 (puente) en adelante
    if (ctx.currentPhase >= 5) return null;

    for (const pat of GOODBYE_PATTERNS) {
      const m = text.match(pat);
      if (m) {
        return {
          ruleId: 'V05',
          description: `Despedida ("${m[0]}") en fase ${ctx.currentPhase}, antes de cualificar`,
          severity: 'warn',
          match: m[0],
          suggestion: 'Eliminar despedida y mantener la conversación abierta con una pregunta.',
        };
      }
    }
    return null;
  },
};
