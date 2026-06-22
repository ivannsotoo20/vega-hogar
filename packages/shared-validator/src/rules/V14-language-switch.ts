import type { ValidationRule } from '../types.js';

/**
 * STUB. Detectar cambio de idioma respecto al agente.locale requiere lib de
 * detección de idioma (franc, langdetect). Por ahora stub.
 */
export const V14_languageSwitch: ValidationRule = {
  id: 'V14',
  description: 'Cambio de idioma inesperado vs locale del agente',
  stub: true,
  check: () => null,
};
