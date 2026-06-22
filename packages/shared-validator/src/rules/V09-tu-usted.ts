import type { ValidationRule } from '../types.js';

/**
 * STUB. Detectar mezcla tú/usted requiere tokenización del mensaje + pasado del
 * tratamiento del agente. Implementación realista: cargar agente.tone.tratamiento
 * y verificar coherencia. Por ahora marca como stub.
 */
export const V09_tuUsted: ValidationRule = {
  id: 'V09',
  description: 'Inconsistencia tú/usted vs tratamiento del agente',
  stub: true,
  check: () => null,
};
