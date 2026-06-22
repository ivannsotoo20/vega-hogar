import type { ValidationRule } from '../types.js';

export const V00_empty: ValidationRule = {
  id: 'V00',
  description: 'Mensaje vacío o solo whitespace',
  check: (text) => {
    if (!text || text.trim().length === 0) {
      return {
        ruleId: 'V00',
        description: 'Mensaje vacío o solo whitespace',
        severity: 'error',
        suggestion: 'No enviar. Solicitar regeneración al Generator.',
      };
    }
    return null;
  },
};
