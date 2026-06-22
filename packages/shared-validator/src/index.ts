import { DEFAULT_RULES } from './rules/index.js';
import type {
  RuleViolation,
  ValidateOptions,
  ValidationContext,
  ValidationResult,
  ValidationRule,
} from './types.js';

export type {
  Channel,
  Track,
  RuleCheck,
  RuleViolation,
  ValidateOptions,
  ValidationContext,
  ValidationResult,
  ValidationRule,
} from './types.js';
export { DEFAULT_RULES } from './rules/index.js';
export * from './rules/index.js';
// Heurística de tratamiento (tú/usted) usada por V18 y por el motor (mirror_lead
// inyecta directiva dinámica al system prompt según la detección).
export { detectAddressing, type AddressingResult } from './lib/detect-addressing.js';

/**
 * Valida un mensaje del agente contra las reglas V00-V19.
 *
 * `text` es el mensaje COMPLETO post-Judge (antes del Splitter). Para validar
 * partes individuales del Splitter, llama a `validateMessage` por cada parte.
 *
 * No muta ni reescribe — solo reporta. El caller decide si bloquear (errors) o
 * degradar (warns).
 */
export function validateMessage(
  text: string,
  ctx: ValidationContext,
  options: ValidateOptions = {},
): ValidationResult {
  const baseRules = options.rules ?? DEFAULT_RULES;
  const rules = filterRules(baseRules, options);

  const violations: RuleViolation[] = [];
  for (const rule of rules) {
    if (rule.stub) continue;
    try {
      const v = rule.check(text, ctx);
      if (v) violations.push(v);
    } catch (err) {
      // Una regla rota no debe tirar el pipeline.
      // eslint-disable-next-line no-console
      console.warn(`[validator] rule ${rule.id} threw:`, (err as Error).message);
    }
  }

  const hasErrors = violations.some((v) => v.severity === 'error');
  return {
    ok: violations.length === 0,
    hasErrors,
    violations,
  };
}

function filterRules(rules: ValidationRule[], options: ValidateOptions): ValidationRule[] {
  let out = rules;
  if (options.only) {
    const set = new Set(options.only);
    out = out.filter((r) => set.has(r.id));
  }
  if (options.skip) {
    const set = new Set(options.skip);
    out = out.filter((r) => !set.has(r.id));
  }
  return out;
}
