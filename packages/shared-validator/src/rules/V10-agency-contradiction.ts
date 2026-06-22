import type { ValidationRule } from '../types.js';

/**
 * STUB. Detectar contradicción con el banco de frases / doctrina de la agencia
 * (bloque `agencia_vega`) requiere embedding/RAG semántico. Se activará cuando
 * integremos un store de embeddings (pgvector ya disponible en Supabase via
 * `agent_knowledge`). Re-domain de V10-coach-contradiction de SETTER.
 */
export const V10_agencyContradiction: ValidationRule = {
  id: 'V10',
  description: 'Contradicción con la doctrina/banco de frases de la agencia',
  stub: true,
  check: () => null,
};
