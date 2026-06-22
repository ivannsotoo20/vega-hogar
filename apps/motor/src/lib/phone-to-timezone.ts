/**
 * Inferencia de timezone IANA del lead a partir de su prefijo telefónico E.164.
 *
 * Mapa estático con los prefijos hispanohablantes principales + algunos comunes
 * (US/CA fallback). Match por longitud descendente (3 antes que 2 antes que 1)
 * para evitar colisiones.
 *
 * NULL/desconocido → null. El caller decide qué fallback usar (típicamente la
 * timezone de la agencia, Europe/Madrid).
 */

const PREFIX_TO_TZ: Record<string, string> = {
  // España
  '34': 'Europe/Madrid',
  // Latam hispanohablante
  '54': 'America/Argentina/Buenos_Aires',
  '52': 'America/Mexico_City',
  '57': 'America/Bogota',
  '51': 'America/Lima',
  '56': 'America/Santiago',
  '58': 'America/Caracas',
  '598': 'America/Montevideo',
  '595': 'America/Asuncion',
  '593': 'America/Guayaquil',
  '591': 'America/La_Paz',
  '506': 'America/Costa_Rica',
  '507': 'America/Panama',
  '503': 'America/El_Salvador',
  '502': 'America/Guatemala',
  '504': 'America/Tegucigalpa',
  '505': 'America/Managua',
  '53': 'America/Havana',
  '809': 'America/Santo_Domingo',
  '829': 'America/Santo_Domingo',
  '849': 'America/Santo_Domingo',
  '787': 'America/Puerto_Rico',
  '939': 'America/Puerto_Rico',
  // Brasil
  '55': 'America/Sao_Paulo',
  // Portugal
  '351': 'Europe/Lisbon',
  // Reino Unido
  '44': 'Europe/London',
  // US / Canada (fallback genérico — variará por estado)
  '1': 'America/New_York',
};

// Lista ordenada por longitud descendente para resolución determinística.
const PREFIX_BY_LENGTH = Object.keys(PREFIX_TO_TZ).sort((a, b) => b.length - a.length);

/**
 * Normaliza un teléfono a string de dígitos (sin `+`, sin espacios/guiones).
 * Devuelve null si no es parseable.
 */
function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 0) return null;
  return digits;
}

/**
 * Devuelve el timezone IANA del lead inferido a partir del prefijo de su
 * teléfono. Si no se reconoce → null.
 */
export function inferTimezoneFromPhone(phone: string | null | undefined): string | null {
  const digits = normalizePhone(phone);
  if (!digits) return null;

  for (const prefix of PREFIX_BY_LENGTH) {
    if (digits.startsWith(prefix)) {
      const remainder = digits.slice(prefix.length);
      // Un prefijo internacional sin nada detrás no es un phone válido.
      if (remainder.length < 4) continue;
      return PREFIX_TO_TZ[prefix] ?? null;
    }
  }
  return null;
}

/** Solo expuesto para tests. */
export const __TEST_PREFIX_MAP = PREFIX_TO_TZ;
