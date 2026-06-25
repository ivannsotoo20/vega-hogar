import { describe, it, expect } from 'vitest';
import { makeFakeDb, makeFakeSupabase } from './_fake-supabase.js';
import { applySystemLabels } from '../src/services/labels/apply-system-labels.js';

function seed() {
  return makeFakeDb({
    tenant_labels: [
      { id: 1, tenant_id: 1, name: 'Lead caliente', is_system: true, pause_ai_on_apply: false, resume_ai_on_apply: false, auto_assign_to: null },
      { id: 2, tenant_id: 1, name: 'Cierre perdido', is_system: true, pause_ai_on_apply: true, resume_ai_on_apply: false, auto_assign_to: null },
      { id: 3, tenant_id: 1, name: 'Visita agendada', is_system: true, pause_ai_on_apply: false, resume_ai_on_apply: false, auto_assign_to: null },
      { id: 4, tenant_id: 1, name: 'Tasación pendiente', is_system: true, pause_ai_on_apply: false, resume_ai_on_apply: false, auto_assign_to: null },
    ],
    conversation_labels: [],
    conversations: [{ id: 9, tenant_id: 1, assigned_user_id: null }],
  });
}

describe('applySystemLabels (re-domain Vega)', () => {
  it('status qualified → Lead caliente', async () => {
    const db = seed();
    const res = await applySystemLabels({ supabase: makeFakeSupabase(db), tenantId: 1, conversationId: 9, status: 'qualified' });
    expect(res.appliedLabels).toEqual(['Lead caliente']);
    expect(db.tables.conversation_labels!).toHaveLength(1);
    expect(db.tables.conversation_labels![0]!.label_id).toBe(1);
  });

  it('status disqualified → Cierre perdido', async () => {
    const db = seed();
    const res = await applySystemLabels({ supabase: makeFakeSupabase(db), tenantId: 1, conversationId: 9, status: 'disqualified' });
    expect(res.appliedLabels).toEqual(['Cierre perdido']);
  });

  it('visita de comprador agendada → Visita agendada', async () => {
    const db = seed();
    const res = await applySystemLabels({ supabase: makeFakeSupabase(db), tenantId: 1, conversationId: 9, status: 'active', bookedVisit: true, isTasation: false });
    expect(res.appliedLabels).toEqual(['Visita agendada']);
  });

  it('tasación agendada → Tasación pendiente', async () => {
    const db = seed();
    const res = await applySystemLabels({ supabase: makeFakeSupabase(db), tenantId: 1, conversationId: 9, status: 'active', bookedVisit: true, isTasation: true });
    expect(res.appliedLabels).toEqual(['Tasación pendiente']);
  });

  it('es idempotente (segunda aplicación = no-op)', async () => {
    const db = seed();
    const supabase = makeFakeSupabase(db);
    await applySystemLabels({ supabase, tenantId: 1, conversationId: 9, status: 'qualified' });
    const second = await applySystemLabels({ supabase, tenantId: 1, conversationId: 9, status: 'qualified' });
    expect(second.appliedLabels).toEqual([]);
    expect(db.tables.conversation_labels!).toHaveLength(1);
  });

  it('status active sin booking → no aplica nada', async () => {
    const db = seed();
    const res = await applySystemLabels({ supabase: makeFakeSupabase(db), tenantId: 1, conversationId: 9, status: 'active' });
    expect(res.appliedLabels).toEqual([]);
    expect(db.tables.conversation_labels!).toHaveLength(0);
  });
});
