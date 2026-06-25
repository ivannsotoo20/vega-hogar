import type { AvailableSlot } from '@vega-hogar/prompt-composer';
import { env } from '../../config/env.js';

/**
 * `consultar_disponibilidad_comercial` (tool PRE-pipeline). En F10b el provider es
 * MOCK: genera slots sintéticos en horario laboral (próximos días hábiles, 11:00
 * y 17:00 hora Europe/Madrid). El driver real Cal.com llega en F10c (`CALENDAR_PROVIDER`).
 *
 * Devuelve `AvailableSlot[]` (shape del prompt-composer): `{ iso, humanLabel }`.
 */

export interface ConsultarDisponibilidadParams {
  /** Reservado para el provider real (Cal.com): qué comercial / oficina. */
  officeId?: number | null;
  /** Tasación (track vendedor) vs visita (comprador). Informativo en mock. */
  isTasacion?: boolean;
  /** Número de slots a devolver. Default 4. */
  count?: number;
}

const SLOT_HOURS = [11, 17];
const HUMAN_FMT = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export async function consultarDisponibilidad(
  params: ConsultarDisponibilidadParams = {},
): Promise<AvailableSlot[]> {
  if (env.CALENDAR_PROVIDER !== 'mock') {
    // F10c: aquí entrará el cliente Cal.com (slots reales). Hasta entonces, mock.
    return mockSlots(params.count ?? 4);
  }
  return mockSlots(params.count ?? 4);
}

function mockSlots(count: number): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // Empezar mañana.
  cursor.setDate(cursor.getDate() + 1);

  let guard = 0;
  while (slots.length < count && guard < 30) {
    guard++;
    const day = cursor.getDay(); // 0=domingo, 6=sábado
    if (day !== 0 && day !== 6) {
      for (const hour of SLOT_HOURS) {
        if (slots.length >= count) break;
        const slot = new Date(cursor);
        slot.setHours(hour, 0, 0, 0);
        slots.push({ iso: slot.toISOString(), humanLabel: HUMAN_FMT.format(slot) });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}
