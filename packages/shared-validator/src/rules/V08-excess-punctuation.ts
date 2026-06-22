import type { ValidationRule } from '../types.js';

const PUNCT_PATTERNS = [
  { re: /!{2,}/g, name: 'múltiples !!' },
  { re: /\?{2,}/g, name: 'múltiples ??' },
  { re: /\.{4,}/g, name: 'puntos suspensivos extendidos (.... o más)' },
];

export const V08_excessPunctuation: ValidationRule = {
  id: 'V08',
  description: 'Signos de puntuación excesivos',
  check: (text) => {
    for (const { re, name } of PUNCT_PATTERNS) {
      const m = text.match(re);
      if (m && m.length > 0) {
        return {
          ruleId: 'V08',
          description: `Puntuación excesiva: ${name}`,
          severity: 'warn',
          match: m[0]!,
          suggestion: 'Reducir a un solo signo. Los agentes profesionales no enfatizan con exclamaciones múltiples.',
        };
      }
    }
    return null;
  },
};
