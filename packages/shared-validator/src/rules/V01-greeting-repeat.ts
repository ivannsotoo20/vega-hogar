import type { ValidationRule } from '../types.js';

const GREETING_PATTERNS = [
  /^\s*hola\b/i,
  /^\s*buen[oa]s\b/i,
  /^\s*hey\b/i,
  /^\s*qué\s+tal\b/i,
  /^\s*qué\s+pasa\b/i,
];

function startsWithGreeting(text: string): boolean {
  return GREETING_PATTERNS.some((re) => re.test(text));
}

export const V01_greetingRepeat: ValidationRule = {
  id: 'V01',
  description: 'Saludo repetido tras el primer mensaje',
  check: (text, ctx) => {
    if (ctx.isFirstAssistantMessage) return null;
    if (!startsWithGreeting(text)) return null;

    return {
      ruleId: 'V01',
      description: 'El bot saludó como si fuera el primer turno cuando ya hay conversación previa',
      severity: 'warn',
      match: text.slice(0, 30),
      suggestion: 'Eliminar saludo y empezar directo con la pregunta o validación.',
    };
  },
};
