import type { ValidationRule } from '../types.js';

// Regex que detecta emojis (clase de unicode amplia). No es perfecto pero cubre el 99%.
// Cubre Misc Symbols and Pictographs, Emoticons, Transport, Supplemental Symbols, Flags, etc.
const EMOJI_REGEX =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

export const V02_emojiWhitelist: ValidationRule = {
  id: 'V02',
  description: 'Emoji fuera de la whitelist de la agencia',
  check: (text, ctx) => {
    const whitelist = ctx.emojisWhitelist;
    if (!whitelist || whitelist.length === 0) return null;

    const found = text.match(EMOJI_REGEX);
    if (!found) return null;

    const offenders = found.filter((e) => !whitelist.includes(e));
    if (offenders.length === 0) return null;

    return {
      ruleId: 'V02',
      description: `Emoji(s) fuera de whitelist: ${[...new Set(offenders)].join(' ')}`,
      severity: 'warn',
      match: offenders.join(''),
      suggestion: 'Eliminar el emoji o sustituir por uno de la whitelist.',
    };
  },
};
