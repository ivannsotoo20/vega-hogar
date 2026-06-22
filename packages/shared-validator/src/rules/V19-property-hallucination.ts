import type { ValidationRule } from '../types.js';

/**
 * V19 — Anti-alucinación de inmuebles (NUEVA en Vega, mitiga el hole H2 de la
 * Opción A / RAG).
 *
 * El motor inyecta en el system prompt un set acotado de inmuebles
 * (`buscar_inmuebles` → ctx.injectedPropertyIds). La tool-output del Generator
 * (`respond_as_inmobiliario.proposed_property_ids` → ctx.proposedPropertyIds)
 * debe ser un SUBCONJUNTO de ese set. Si el agente propone un inmueble que NO se
 * inyectó, lo está alucinando → severity `error` (bloquea el turno; el motor no
 * agenda inmuebles inventados).
 *
 * Contrato duro: el motor SIEMPRE pasa `injectedPropertyIds` (array vacío si no
 * buscó este turno). Por tanto, si no se buscó, cualquier id propuesto es
 * fantasma — que es exactamente lo correcto.
 *
 * Nota: V19 valida el CAMPO ESTRUCTURADO de la tool-output (vía ctx), no el
 * texto. El parámetro `text` se ignora.
 */
export const V19_propertyHallucination: ValidationRule = {
  id: 'V19',
  description: 'Inmueble propuesto fuera del set inyectado (alucinación)',
  check: (_text, ctx) => {
    const proposed = ctx.proposedPropertyIds ?? [];
    if (proposed.length === 0) return null;
    const injected = new Set(ctx.injectedPropertyIds ?? []);
    const phantom = proposed.filter((id) => !injected.has(id));
    if (phantom.length === 0) return null;
    return {
      ruleId: 'V19',
      description: `Propone inmueble(s) no inyectado(s): ${phantom.join(', ')}`,
      severity: 'error',
      match: phantom.join(','),
      suggestion: 'Proponer solo IDs presentes en {{available_properties}} de este turno.',
    };
  },
};
