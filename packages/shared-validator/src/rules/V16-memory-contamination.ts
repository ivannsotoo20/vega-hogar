import type { ValidationRule } from '../types.js';

const CONTAMINATION_PATTERNS = [
  /\bseguimos\s+hablando\s+(otro|en\s+otro|m[aá]s\s+tarde)\b/i,
  /\bte\s+respondo\s+cuando\s+pueda\b/i,
  /\b(hablamos|seguimos)\s+(en\s+otro|otro)\s+momento\b/i,
  /\bya\s+te\s+contestar[eé]\b/i,
];

export const V16_memoryContamination: ValidationRule = {
  id: 'V16',
  description: 'Contaminación de memoria (sugerencias de pausar la conversación)',
  check: (text) => {
    for (const pat of CONTAMINATION_PATTERNS) {
      const m = text.match(pat);
      if (m) {
        return {
          ruleId: 'V16',
          description: `Contaminación: "${m[0]}"`,
          severity: 'warn',
          match: m[0],
          suggestion: 'Eliminar. El bot no debe pausar la conversación motu proprio — el lead retoma cuando quiera.',
        };
      }
    }
    return null;
  },
};
