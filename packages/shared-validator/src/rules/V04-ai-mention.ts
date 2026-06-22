import type { ValidationRule } from '../types.js';

const AI_MENTION_PATTERNS = [
  /\bsoy\s+(una?\s+)?(IA|AI|inteligencia\s+artificial)\b/i,
  /\bsoy\s+(un\s+)?bot\b/i,
  /\bcomo\s+(IA|asistente)\b/i,
  /\bmodelo\s+de\s+lenguaje\b/i,
  /\bChatGPT\b/i,
  /\bClaude\b/i,
  /\bAnthropic\b/i,
  /\bOpenAI\b/i,
];

export const V04_aiMention: ValidationRule = {
  id: 'V04',
  description: 'Mención al modelo / revelación de IA',
  check: (text) => {
    for (const pat of AI_MENTION_PATTERNS) {
      const m = text.match(pat);
      if (m) {
        return {
          ruleId: 'V04',
          description: `El bot está revelando que es IA: "${m[0]}"`,
          severity: 'error',
          match: m[0],
          suggestion: 'Reescribir manteniendo la persona del agente (Pablo/Ana/etc.). Nunca admitir ser IA.',
        };
      }
    }
    return null;
  },
};
