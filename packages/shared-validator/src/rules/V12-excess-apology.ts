import type { ValidationRule } from '../types.js';

const APOLOGY_PATTERNS = [
  /\blo\s+siento\b/gi,
  /\bperdona\b/gi,
  /\bdisculpa\b/gi,
  /\bdiscúlpame\b/gi,
  /\bperdón\b/gi,
];

export const V12_excessApology: ValidationRule = {
  id: 'V12',
  description: 'Disculpa excesiva (≥2 ocurrencias en un mensaje)',
  check: (text) => {
    let total = 0;
    for (const pat of APOLOGY_PATTERNS) {
      total += (text.match(pat) || []).length;
    }
    if (total < 2) return null;
    return {
      ruleId: 'V12',
      description: `${total} disculpas en un solo mensaje`,
      severity: 'warn',
      suggestion: 'Quitar disculpas. El agente no debe sonar inseguro.',
    };
  },
};
