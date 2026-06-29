/**
 * Cliente HTTP de Cal.com API v2 (subset que usa el motor Vega).
 *
 * - GET  {base}/slots?eventTypeId=&start=&end=&timeZone=  → disponibilidad.
 * - POST {base}/bookings  {eventTypeId, start(UTC ISO), attendee:{name,email,timeZone}} → crea reserva.
 *
 * Auth: header `Authorization: Bearer cal_<key>` + `cal-api-version`. base default
 * `https://api.cal.com/v2`. CODEADO + gated (go-live posterior): los shapes exactos de
 * Cal.com se revalidan contra la cuenta real en el go-live; el parseo es defensivo.
 */

const DEFAULT_BASE = 'https://api.cal.com/v2';
// Versiones del header `cal-api-version` por endpoint (Cal.com versiona por fecha).
const SLOTS_API_VERSION = '2024-09-04';
const BOOKINGS_API_VERSION = '2024-08-13';

export class CalComApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'CalComApiError';
    this.status = status;
    this.body = body;
  }
}

export interface CalComSlot {
  /** Inicio del slot en ISO 8601 (UTC). */
  iso: string;
}

export interface CalComGetSlotsParams {
  apiKey: string;
  eventTypeId: number;
  /** Rango de búsqueda (YYYY-MM-DD). */
  start: string;
  end: string;
  timeZone?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function calcomGetSlots(params: CalComGetSlotsParams): Promise<CalComSlot[]> {
  const { apiKey, eventTypeId, start, end, timeZone, baseUrl = DEFAULT_BASE, fetchImpl = fetch } = params;
  if (!apiKey) throw new Error('calcomGetSlots: apiKey requerida');
  const qs = new URLSearchParams({ eventTypeId: String(eventTypeId), start, end });
  if (timeZone) qs.set('timeZone', timeZone);
  const url = `${baseUrl.replace(/\/$/, '')}/slots?${qs.toString()}`;

  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, 'cal-api-version': SLOTS_API_VERSION, Accept: 'application/json' },
  });
  const parsed = await safeJson(res);
  if (!res.ok) throw new CalComApiError(`Cal.com getSlots HTTP ${res.status}`, res.status, parsed);
  return extractSlots(parsed);
}

export interface CalComCreateBookingParams {
  apiKey: string;
  eventTypeId: number;
  /** Inicio en UTC ISO 8601. */
  startIso: string;
  attendee: { name: string; email: string; timeZone?: string };
  metadata?: Record<string, string>;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface CalComBookingResult {
  uid: string;
  id: number | null;
  status: string;
  raw: unknown;
}

export async function calcomCreateBooking(params: CalComCreateBookingParams): Promise<CalComBookingResult> {
  const { apiKey, eventTypeId, startIso, attendee, metadata, baseUrl = DEFAULT_BASE, fetchImpl = fetch } = params;
  if (!apiKey) throw new Error('calcomCreateBooking: apiKey requerida');
  if (!attendee?.name || !attendee?.email) throw new Error('calcomCreateBooking: attendee name+email requeridos');

  const url = `${baseUrl.replace(/\/$/, '')}/bookings`;
  const body = {
    eventTypeId,
    start: startIso,
    attendee: { name: attendee.name, email: attendee.email, timeZone: attendee.timeZone ?? 'Europe/Madrid' },
    ...(metadata ? { metadata } : {}),
  };
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'cal-api-version': BOOKINGS_API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const parsed = await safeJson(res);
  if (!res.ok) throw new CalComApiError(`Cal.com createBooking HTTP ${res.status}`, res.status, parsed);

  const data = (parsed as { data?: Record<string, unknown> })?.data ?? {};
  const uid = typeof data.uid === 'string' ? data.uid : `calcom-${Date.now()}`;
  const id = typeof data.id === 'number' ? data.id : null;
  const status = typeof data.status === 'string' ? data.status : 'accepted';
  return { uid, id, status, raw: parsed };
}

async function safeJson(res: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Extrae inicios de slot del payload de Cal.com de forma defensiva. Soporta el
 * formato por defecto (objeto keyed por fecha → array de {start}) y `format=range`
 * (array de {start,end}). Recoge cualquier `start` ISO que encuentre.
 */
function extractSlots(payload: unknown): CalComSlot[] {
  const data = (payload as { data?: unknown })?.data ?? payload;
  const out: CalComSlot[] = [];
  const pushStart = (v: unknown) => {
    if (v && typeof v === 'object' && typeof (v as { start?: unknown }).start === 'string') {
      out.push({ iso: (v as { start: string }).start });
    }
  };
  if (Array.isArray(data)) {
    for (const it of data) pushStart(it);
  } else if (data && typeof data === 'object') {
    for (const val of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(val)) for (const it of val) pushStart(it);
    }
  }
  return out;
}
