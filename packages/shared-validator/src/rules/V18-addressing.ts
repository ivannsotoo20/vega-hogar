import type { ValidationRule } from '../types.js';
import { detectAddressing } from '../lib/detect-addressing.js';

/**
 * V18 — Consistencia de tratamiento (tú/usted).
 *
 * Cuando la agencia fija `addressingMode='tu'` o `'usted'` (cumplimiento
 * ESTRICTO), V18 valida que el output del agente coincida con el modo.
 *
 * Si `ctx.expectedAddressing` está undefined → skip (caso `mirror_lead`: el
 * motor inyecta directiva dinámica al system prompt; no aplicamos validador
 * porque la "expectativa" cambia turno a turno).
 *
 * Heurística: usa `detectAddressing` (Unicode-aware, ponderado). Devuelve
 * 'warn' por design — el orquestador de pipeline NO tiene retry logic para
 * V18 en esta versión (al ser heurístico, el coste de retry vs falso positivo
 * no se justifica todavía; el plan documenta degradar a warning-only si la
 * precisión cae). En el futuro se puede subir a 'error' o añadir retry si los
 * fixtures muestran ≤10% falsos positivos en producción.
 */
export const V18_addressingConsistency: ValidationRule = {
  id: 'V18',
  description: 'Inconsistencia de tratamiento (tú/usted) respecto al modo de la agencia',
  check: (text, ctx) => {
    const expected = ctx.expectedAddressing;
    if (expected !== 'tu' && expected !== 'usted') return null;

    const detected = detectAddressing(text);

    // Si el detector no se decide ('ambiguous') no penalizamos — texto neutral
    // es aceptable en ambos modos. El modelo recibe instrucción explícita por
    // prompt, y el comportamiento ambiguo en un mensaje corto no rompe nada.
    if (detected === 'ambiguous') return null;

    // Si el detected coincide con el expected → todo OK.
    if (detected === expected) return null;

    // Mismatch claro: el modelo usó el tratamiento opuesto.
    return {
      ruleId: 'V18',
      description: `La agencia configuró tratamiento "${expected}" pero el output usa "${detected}"`,
      severity: 'warn',
      match: detected,
      suggestion:
        expected === 'tu'
          ? 'Conjuga en 2ª persona singular (tú/te/ti/contigo). Evita "usted", "le", "su".'
          : 'Conjuga en 3ª persona formal (usted/le/su). Evita "tú", "te", "ti".',
    };
  },
};
