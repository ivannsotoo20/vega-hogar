import { describe, it, expect } from 'vitest';
import { calcomGetSlots, calcomCreateBooking, CalComApiError } from '../src/lib/calcom-client.js';

function fakeFetch(status: number, body: unknown) {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  })) as unknown as typeof fetch;
}

describe('calcomGetSlots', () => {
  it('extrae los starts del formato por fecha', async () => {
    const fetchImpl = fakeFetch(200, {
      data: {
        '2026-07-01': [{ start: '2026-07-01T09:00:00.000Z' }, { start: '2026-07-01T11:00:00.000Z' }],
        '2026-07-02': [{ start: '2026-07-02T09:00:00.000Z' }],
      },
    });
    const slots = await calcomGetSlots({ apiKey: 'cal_x', eventTypeId: 10, start: '2026-07-01', end: '2026-07-15', fetchImpl });
    expect(slots.map((s) => s.iso)).toEqual([
      '2026-07-01T09:00:00.000Z',
      '2026-07-01T11:00:00.000Z',
      '2026-07-02T09:00:00.000Z',
    ]);
  });
  it('lanza CalComApiError en HTTP no-ok', async () => {
    const fetchImpl = fakeFetch(401, { error: 'unauthorized' });
    await expect(calcomGetSlots({ apiKey: 'cal_x', eventTypeId: 10, start: 'a', end: 'b', fetchImpl })).rejects.toBeInstanceOf(CalComApiError);
  });
});

describe('calcomCreateBooking', () => {
  it('crea la reserva y devuelve uid/status', async () => {
    const fetchImpl = fakeFetch(201, { status: 'success', data: { id: 99, uid: 'bk_abc', status: 'accepted' } });
    const res = await calcomCreateBooking({
      apiKey: 'cal_x',
      eventTypeId: 10,
      startIso: '2026-07-01T09:00:00.000Z',
      attendee: { name: 'Ana', email: 'ana@example.com', timeZone: 'Europe/Madrid' },
      fetchImpl,
    });
    expect(res.uid).toBe('bk_abc');
    expect(res.id).toBe(99);
    expect(res.status).toBe('accepted');
  });
  it('exige attendee name+email', async () => {
    await expect(
      // @ts-expect-error — attendee incompleto a propósito
      calcomCreateBooking({ apiKey: 'cal_x', eventTypeId: 10, startIso: 'x', attendee: { name: 'Ana' } }),
    ).rejects.toThrow(/attendee/);
  });
});
