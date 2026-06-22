/**
 * Mapeo IANA timezone → etiqueta humana es-ES corta para el agente.
 *
 * Usado para placeholders tipo `{{lead_timezone_label}}` que el agente inyecta en
 * frases como "el martes 19 a las 13h hora España".
 *
 * Si el IANA no está en el mapa, se devuelve un fallback derivado de la zona
 * (p.ej. "America/Lima" → "hora Lima") en lugar de null, para que el agente
 * SIEMPRE tenga una etiqueta legible — nunca un IANA crudo.
 */

const TZ_TO_LABEL: Record<string, string> = {
  // España
  'Europe/Madrid': 'hora España',
  'Atlantic/Canary': 'hora Canarias',
  // Latam
  'America/Argentina/Buenos_Aires': 'hora Argentina',
  'America/Mexico_City': 'hora México',
  'America/Bogota': 'hora Colombia',
  'America/Lima': 'hora Perú',
  'America/Santiago': 'hora Chile',
  'America/Caracas': 'hora Venezuela',
  'America/Montevideo': 'hora Uruguay',
  'America/Asuncion': 'hora Paraguay',
  'America/Guayaquil': 'hora Ecuador',
  'America/La_Paz': 'hora Bolivia',
  'America/Costa_Rica': 'hora Costa Rica',
  'America/Panama': 'hora Panamá',
  'America/El_Salvador': 'hora El Salvador',
  'America/Guatemala': 'hora Guatemala',
  'America/Tegucigalpa': 'hora Honduras',
  'America/Managua': 'hora Nicaragua',
  'America/Havana': 'hora Cuba',
  'America/Santo_Domingo': 'hora R. Dominicana',
  'America/Puerto_Rico': 'hora Puerto Rico',
  // Brasil
  'America/Sao_Paulo': 'hora Brasil',
  // Portugal
  'Europe/Lisbon': 'hora Portugal',
  // Reino Unido
  'Europe/London': 'hora Reino Unido',
  // US / Canada
  'America/New_York': 'hora Este (US)',
  'America/Chicago': 'hora Central (US)',
  'America/Denver': 'hora Montaña (US)',
  'America/Los_Angeles': 'hora Pacífico (US)',
};

/**
 * Devuelve la etiqueta legible en español del timezone IANA.
 * Si la timezone es null/empty → null.
 * Si no está en el mapa → fallback derivado del último segmento ("hora <ciudad>").
 */
export function timezoneToLabel(tz: string | null | undefined): string | null {
  if (!tz) return null;
  const direct = TZ_TO_LABEL[tz];
  if (direct) return direct;
  const lastSegment = tz.split('/').pop();
  if (!lastSegment) return null;
  const humanCity = lastSegment.replace(/_/g, ' ');
  return `hora ${humanCity}`;
}

/** Solo expuesto para tests. */
export const __TEST_TZ_LABEL_MAP = TZ_TO_LABEL;
