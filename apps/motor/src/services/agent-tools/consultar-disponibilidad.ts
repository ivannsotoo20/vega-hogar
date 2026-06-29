import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import type { AvailableSlot } from '@vega-hogar/prompt-composer';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { calcomGetSlots } from '../../lib/calcom-client.js';
import { resolveCalcomConfig } from '../calcom-provider.js';

/**
 * `consultar_disponibilidad_comercial` (tool PRE-pipeline). Provider por
 * `CALENDAR_PROVIDER`:
 *  - **mock** (F10b, default): slots sintéticos en horario laboral (Europe/Madrid).
 *  - **calcom** (F10c, gated): `GET /v2/slots` de Cal.com (eventTypeId del tenant).
 *    Si Cal.com no está configurado o falla → cae a mock (degradación grácil).
 *
 * Devuelve `AvailableSlot[]` (shape del prompt-composer): `{ iso, humanLabel }`.
 */

export interface ConsultarDisponibilidadParams {
  /** Requeridos para el provider calcom (resolver config del tenant). */
  supabase?: SupabaseClient<Database>;
  tenantId?: number;
  officeId?: number | null;
  isTasacion?: boolean;
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
  const count = params.count ?? 4;

  if (env.CALENDAR_PROVIDER === 'calcom' && params.supabase && params.tenantId) {
    try {
      const cfg = await resolveCalcomConfig(params.supabase, params.tenantId);
      if (cfg) {
        const { start, end } = next14DaysRange();
        const slots = await calcomGetSlots({
          apiKey: cfg.apiKey,
          eventTypeId: cfg.eventTypeId,
          start,
          end,
          timeZone: 'Europe/Madrid',
          baseUrl: cfg.baseUrl,
        });
        const mapped = slots
          .slice(0, count)
          .map((s) => ({ iso: s.iso, humanLabel: HUMAN_FMT.format(new Date(s.iso)) }));
        if (mapped.length > 0) return mapped;
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), tenantId: params.tenantId },
        '[consultar-disponibilidad] Cal.com falló → fallback mock',
      );
    }
  }

  return mockSlots(count);
}

function next14DaysRange(): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 14);
  return { start: now.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function mockSlots(count: number): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1); // desde mañana

  let guard = 0;
  while (slots.length < count && guard < 30) {
    guard++;
    const day = cursor.getDay();
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
