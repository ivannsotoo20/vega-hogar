import { describe, it, expect } from 'vitest';
import { makeFakeDb, makeFakeSupabase } from './_fake-supabase.js';
import { matchLeadFromCalcom, type CalcomBooking } from '../src/services/appointment-matcher.js';
import { applyCalcomAppointment } from '../src/services/appointment-applier.js';

function booking(over: Partial<CalcomBooking> = {}): CalcomBooking {
  return {
    uid: 'bk_1',
    startTime: '2026-07-01T09:00:00.000Z',
    endTime: '2026-07-01T10:00:00.000Z',
    status: 'accepted',
    title: 'Visita',
    attendees: [{ name: 'Ana', email: 'ana@example.com', timeZone: 'Europe/Madrid' }],
    metadata: null,
    ...over,
  };
}

function seed() {
  return makeFakeDb({
    leads: [{ id: 1, tenant_id: 1, tracking_uuid: 'uuid-abc', email: 'ana@example.com' }],
    conversations: [{ id: 9, tenant_id: 1, lead_id: 1, created_at: '2026-06-01T00:00:00Z', handoff_cause: null }],
    calendar_appointments: [],
    pipeline_events: [],
  });
}

describe('matchLeadFromCalcom', () => {
  it('matchea por tracking_uuid en metadata (confianza 100)', async () => {
    const supabase = makeFakeSupabase(seed());
    const res = await matchLeadFromCalcom({ supabase, tenantId: 1, booking: booking({ metadata: { vega_lead_uuid: 'uuid-abc' } }) });
    expect(res).toEqual({ leadId: 1, conversationId: 9, method: 'tracking_uuid', confidence: 100 });
  });
  it('matchea por email del attendee (confianza 90)', async () => {
    const supabase = makeFakeSupabase(seed());
    const res = await matchLeadFromCalcom({ supabase, tenantId: 1, booking: booking() });
    expect(res).toEqual({ leadId: 1, conversationId: 9, method: 'email', confidence: 90 });
  });
  it('unmatched si no hay uuid ni email conocidos', async () => {
    const supabase = makeFakeSupabase(seed());
    const res = await matchLeadFromCalcom({ supabase, tenantId: 1, booking: booking({ attendees: [{ email: 'otro@x.com' }] }) });
    expect(res.method).toBe('unmatched');
    expect(res.leadId).toBeNull();
  });
});

describe('applyCalcomAppointment', () => {
  it('created → handoff A_agenda + appointment_scheduled_at + espejo + evento', async () => {
    const db = seed();
    const supabase = makeFakeSupabase(db);
    const res = await applyCalcomAppointment({
      supabase,
      tenantId: 1,
      calendarAccountId: 5,
      booking: booking(),
      eventType: 'created',
      match: { leadId: 1, conversationId: 9, method: 'email', confidence: 90 },
    });
    expect(res.conversationMoved).toBe(true);
    expect(db.tables.calendar_appointments!).toHaveLength(1);
    const conv = db.tables.conversations![0]!;
    expect(conv.status).toBe('handoff');
    expect(conv.handoff_cause).toBe('A_agenda');
    expect(conv.ai_paused_until).toBe('infinity');
    expect(conv.appointment_scheduled_at).toBe('2026-07-01T09:00:00.000Z');
    expect(db.tables.pipeline_events!.some((e) => e.event_type === 'appointment_created')).toBe(true);
  });

  it('cancelled → revoca el handoff A_agenda (IA reactivada)', async () => {
    const db = seed();
    db.tables.conversations![0]!.handoff_cause = 'A_agenda';
    db.tables.conversations![0]!.is_handoff_to_human = true;
    db.tables.conversations![0]!.ai_paused_until = 'infinity';
    const supabase = makeFakeSupabase(db);
    const res = await applyCalcomAppointment({
      supabase,
      tenantId: 1,
      calendarAccountId: 5,
      booking: booking({ status: 'cancelled' }),
      eventType: 'cancelled',
      match: { leadId: 1, conversationId: 9, method: 'email', confidence: 90 },
    });
    expect(res.revoked).toBe(true);
    const conv = db.tables.conversations![0]!;
    expect(conv.status).toBe('active');
    expect(conv.handoff_cause).toBeNull();
    expect(conv.ai_paused_until).toBeNull();
  });

  it('unmatched → solo registra el espejo, sin tocar conversación', async () => {
    const db = seed();
    const supabase = makeFakeSupabase(db);
    const res = await applyCalcomAppointment({
      supabase,
      tenantId: 1,
      calendarAccountId: 5,
      booking: booking(),
      eventType: 'created',
      match: { leadId: null, conversationId: null, method: 'unmatched', confidence: 0 },
    });
    expect(res.conversationMoved).toBe(false);
    expect(db.tables.calendar_appointments!).toHaveLength(1);
    // conversación intacta
    expect(db.tables.conversations![0]!.status).toBeUndefined();
  });
});
