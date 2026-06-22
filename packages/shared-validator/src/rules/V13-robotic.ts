import type { ValidationRule } from '../types.js';

/**
 * STUB. Detectar tono robótico requiere clasificador o heurística más fina
 * (ratios de mayúsculas, frases plantilla típicas de bots, etc.). Por ahora stub.
 */
export const V13_robotic: ValidationRule = {
  id: 'V13',
  description: 'Respuesta robótica / plantilla detectable',
  stub: true,
  check: () => null,
};
