// @vega-hogar/shared-validator — red de seguridad post-LLM del agente IA.
// Fase 6+: portar V0-V16 de setters_ia y adaptar al dominio inmobiliario.
// Reglas previstas (subset relevante): longitud, tono, no inventar datos
// de inmuebles, no dar tasaciones, no negociar precios, addressing tú/usted,
// detección de palabras prohibidas, lenguaje Vega Hogar.

export type ValidationSeverity = 'warn' | 'error';

export interface ValidationRule {
  id: string;
  description: string;
  severity: ValidationSeverity;
}

export const SHARED_VALIDATOR_PLACEHOLDER = 'fase-6';
