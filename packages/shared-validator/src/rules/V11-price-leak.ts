import type { ValidationRule } from '../types.js';

/**
 * V11′ — INVERSIÓN inmobiliaria de la V11 de SETTER.
 *
 * En SETTER V11 bloqueaba CUALQUIER precio antes de la videollamada. En
 * inmobiliaria el precio del inmueble es información de venta LEGÍTIMA que el
 * agente DEBE dar desde el primer momento → NO se valida el precio del inmueble.
 *
 * Lo que se protege (y NUNCA debe soltar el bot, en NINGUNA fase) es:
 *   1. La COMISIÓN / HONORARIOS de la agencia con cifras (lo trata el comercial humano).
 *   2. Los DATOS DE CONTACTO o identidad del PROPIETARIO (el humano media; no se filtran).
 *
 * Severidad `error` → bloquea el turno (degradar / handoff).
 */
const COMMISSION_PATTERNS = [
  /\b(comisi[oó]n|honorarios)\b[^.\n]{0,30}\d/i,
  /\b\d{1,2}\s?%[^.\n]{0,25}(comisi[oó]n|honorarios)\b/i,
  /\bnos\s+llevamos\b[^.\n]{0,20}(\d|%)/i,
];

const OWNER_LEAK_PATTERNS = [
  /\b(tel[eé]fono|contacto|whatsapp|email|correo|n[uú]mero)\b[^.\n]{0,25}\b(del|de\s+la|de\s+el)\s*(propietario|due[ñn]o|vendedor|arrendador)\b/i,
  /\b(propietario|due[ñn]o|vendedor|arrendador)\s+se\s+llama\b/i,
  /\bte\s+(paso|doy|env[ií]o|comparto)\b[^.\n]{0,30}\b(propietario|due[ñn]o)\b/i,
];

export const V11_priceLeak: ValidationRule = {
  id: 'V11',
  description: 'Fuga de comisión/honorarios de la agencia o de datos del propietario',
  check: (text) => {
    for (const pat of COMMISSION_PATTERNS) {
      const m = text.match(pat);
      if (m) {
        return {
          ruleId: 'V11',
          description: `Menciona comisión/honorarios con cifras ("${m[0]}")`,
          severity: 'error',
          match: m[0],
          suggestion: 'No revelar comisiones/honorarios. Lo detalla el comercial humano.',
        };
      }
    }
    for (const pat of OWNER_LEAK_PATTERNS) {
      const m = text.match(pat);
      if (m) {
        return {
          ruleId: 'V11',
          description: `Filtra datos/contacto del propietario ("${m[0]}")`,
          severity: 'error',
          match: m[0],
          suggestion: 'Nunca compartir contacto/identidad del propietario. El comercial humano media.',
        };
      }
    }
    return null;
  },
};
