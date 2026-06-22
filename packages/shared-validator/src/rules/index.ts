import type { ValidationRule } from '../types.js';
import { V00_empty } from './V00-empty.js';
import { V01_greetingRepeat } from './V01-greeting-repeat.js';
import { V02_emojiWhitelist } from './V02-emoji-whitelist.js';
import { V03_length } from './V03-length.js';
import { V04_aiMention } from './V04-ai-mention.js';
import { V05_prematureGoodbye } from './V05-premature-goodbye.js';
import { V06_multiQuestion } from './V06-multi-question.js';
import { V07_linkTooEarly } from './V07-link-too-early.js';
import { V08_excessPunctuation } from './V08-excess-punctuation.js';
import { V09_tuUsted } from './V09-tu-usted.js';
import { V10_agencyContradiction } from './V10-agency-contradiction.js';
import { V11_priceLeak } from './V11-price-leak.js';
import { V12_excessApology } from './V12-excess-apology.js';
import { V13_robotic } from './V13-robotic.js';
import { V14_languageSwitch } from './V14-language-switch.js';
import { V15_phaseGhost } from './V15-phase-ghost.js';
import { V16_memoryContamination } from './V16-memory-contamination.js';
import { V17_forbiddenPhrases } from './V17-forbidden-phrases.js';
import { V18_addressingConsistency } from './V18-addressing.js';
import { V19_propertyHallucination } from './V19-property-hallucination.js';

/**
 * Lista canónica de reglas V00-V19 en orden (red de seguridad inmobiliaria).
 * Las reglas con `stub: true` se ejecutan pero no devuelven violaciones todavía.
 *
 * Re-domain de SETTER:
 * - V07: umbral de enlace bajado a fase 2 (los enlaces de ficha/agenda son normales).
 * - V10: contradicción con la doctrina de la AGENCIA (stub, pendiente RAG).
 * - V11′: INVERTIDA — el precio del inmueble se da; se bloquea comisión/honorarios + datos del propietario.
 * - V15: rango de fase 0..7 (catálogo `phases` dual).
 * - V19: NUEVA — anti-alucinación de inmuebles (proposed ⊆ inyectados).
 */
export const DEFAULT_RULES: ValidationRule[] = [
  V00_empty,
  V01_greetingRepeat,
  V02_emojiWhitelist,
  V03_length,
  V04_aiMention,
  V05_prematureGoodbye,
  V06_multiQuestion,
  V07_linkTooEarly,
  V08_excessPunctuation,
  V09_tuUsted,
  V10_agencyContradiction,
  V11_priceLeak,
  V12_excessApology,
  V13_robotic,
  V14_languageSwitch,
  V15_phaseGhost,
  V16_memoryContamination,
  V17_forbiddenPhrases,
  V18_addressingConsistency,
  V19_propertyHallucination,
];

export {
  V00_empty,
  V01_greetingRepeat,
  V02_emojiWhitelist,
  V03_length,
  V04_aiMention,
  V05_prematureGoodbye,
  V06_multiQuestion,
  V07_linkTooEarly,
  V08_excessPunctuation,
  V09_tuUsted,
  V10_agencyContradiction,
  V11_priceLeak,
  V12_excessApology,
  V13_robotic,
  V14_languageSwitch,
  V15_phaseGhost,
  V16_memoryContamination,
  V17_forbiddenPhrases,
  V18_addressingConsistency,
  V19_propertyHallucination,
};
