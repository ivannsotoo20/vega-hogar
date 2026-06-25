import { describe, it, expect } from 'vitest';
import { makeFakeDb, makeFakeSupabase } from './_fake-supabase.js';
import { agendarVisita } from '../src/services/agent-tools/agendar-visita.js';

function baseDb() {
  return makeFakeDb({
    users: [
      { id: 10, tenant_id: 1, role: 'comercial', active: true },
      { id: 11, tenant_id: 1, role: 'comercial', active: true },
      { id: 20, tenant_id: 1, role: 'comercial', active: true },
    ],
    user_office_assignments: [
      { id: 1, tenant_id: 1, office_id: 5, user_id: 10 },
      { id: 2, tenant_id: 1, office_id: 5, user_id: 11 },
      { id: 3, tenant_id: 1, office_id: 6, user_id: 20 },
    ],
    visits: [],
  });
}

describe('agendarVisita', () => {
  it('agenda una visita de comprador (inserta visits, status scheduled, property_id)', async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);
    const res = await agendarVisita({
      supabase, tenantId: 1, leadId: 100, slotIso: '2026-12-01T11:00:00.000Z',
      isTasation: false, propertyId: 200, officeId: 5,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect([10, 11]).toContain(res.comercialUserId);
    expect(db.tables.visits!).toHaveLength(1);
    expect(db.tables.visits![0]!.status).toBe('scheduled');
    expect(db.tables.visits![0]!.property_id).toBe(200);
    expect(db.tables.visits![0]!.is_tasation).toBe(false);
  });

  it('tasación no lleva property_id', async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);
    const res = await agendarVisita({
      supabase, tenantId: 1, leadId: 100, slotIso: '2026-12-01T17:00:00.000Z',
      isTasation: true, propertyId: 999, officeId: 6,
    });
    expect(res.ok).toBe(true);
    expect(db.tables.visits![0]!.is_tasation).toBe(true);
    expect(db.tables.visits![0]!.property_id).toBeNull();
  });

  it('balancea carga: elige el comercial con menos visitas scheduled', async () => {
    const db = baseDb();
    db.tables.visits!.push({ id: 99, tenant_id: 1, comercial_user_id: 10, status: 'scheduled', scheduled_for: '2026-11-01T11:00:00.000Z' });
    const supabase = makeFakeSupabase(db);
    const res = await agendarVisita({
      supabase, tenantId: 1, leadId: 100, slotIso: '2026-12-03T11:00:00.000Z',
      isTasation: false, propertyId: 200, officeId: 5,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.comercialUserId).toBe(11); // 10 ya tiene 1, 11 tiene 0
  });

  it('rechaza slot inválido', async () => {
    const supabase = makeFakeSupabase(baseDb());
    const res = await agendarVisita({ supabase, tenantId: 1, leadId: 100, slotIso: 'no-es-fecha', isTasation: false, officeId: 5 });
    expect(res).toEqual({ ok: false, reason: 'invalid_slot' });
  });

  it('rechaza si no hay comercial elegible en el tenant', async () => {
    const supabase = makeFakeSupabase(baseDb());
    const res = await agendarVisita({ supabase, tenantId: 2, leadId: 100, slotIso: '2026-12-01T11:00:00.000Z', isTasation: false, officeId: 5 });
    expect(res).toEqual({ ok: false, reason: 'no_comercial' });
  });

  it('detecta conflicto de slot (doble-booking del mismo comercial)', async () => {
    const db = baseDb();
    const slot = '2026-12-02T11:00:00.000Z';
    db.tables.visits!.push({ id: 99, tenant_id: 1, comercial_user_id: 20, status: 'scheduled', scheduled_for: slot });
    const supabase = makeFakeSupabase(db);
    const res = await agendarVisita({ supabase, tenantId: 1, leadId: 100, slotIso: slot, isTasation: false, officeId: 6 });
    expect(res).toEqual({ ok: false, reason: 'slot_conflict' });
  });
});
