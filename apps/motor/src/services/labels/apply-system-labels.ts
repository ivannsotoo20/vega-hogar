import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { applyLabelMotor } from './apply-label.js';

/**
 * Aplica las system labels al final del pipeline (`process-debounced`) según el
 * estado del turno + si se agendó visita/tasación. Re-domain de SETTER a las
 * labels seed de Vega (sin rama GHL `ghl_opportunity_status`).
 *
 * Mapeo (labels seed, `is_system=true`):
 *   - 'Lead caliente'      ← status ∈ {qualified, handoff}
 *   - 'Cierre perdido'     ← status === disqualified
 *   - 'Visita agendada'    ← se agendó visita de comprador
 *   - 'Tasación pendiente' ← se agendó tasación (vendedor)
 *
 * Best-effort: si falla, devuelve errores pero NO rompe el pipeline.
 */

type ConversationStatus = Database['public']['Enums']['conversation_status'];

export interface ApplySystemLabelsInput {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  conversationId: number;
  status: ConversationStatus;
  bookedVisit?: boolean;
  isTasation?: boolean;
}

export interface ApplySystemLabelsResult {
  appliedLabels: string[];
  errors: string[];
}

export async function applySystemLabels(
  input: ApplySystemLabelsInput,
): Promise<ApplySystemLabelsResult> {
  const { supabase, tenantId, conversationId, status, bookedVisit, isTasation } = input;
  const result: ApplySystemLabelsResult = { appliedLabels: [], errors: [] };

  const { data: systemLabels, error: lookupErr } = await supabase
    .from('tenant_labels')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('is_system', true);
  if (lookupErr) {
    result.errors.push(`lookup system labels: ${lookupErr.message}`);
    return result;
  }
  if (!systemLabels || systemLabels.length === 0) return result;

  const byName = new Map<string, number>();
  for (const l of systemLabels) byName.set(String(l.name), Number(l.id));

  const toApply: string[] = [];
  if (status === 'qualified' || status === 'handoff') toApply.push('Lead caliente');
  if (status === 'disqualified') toApply.push('Cierre perdido');
  if (bookedVisit && !isTasation) toApply.push('Visita agendada');
  if (bookedVisit && isTasation) toApply.push('Tasación pendiente');

  for (const name of toApply) {
    const labelId = byName.get(name);
    if (!labelId) {
      result.errors.push(`system label "${name}" no seedeada en tenant ${tenantId}`);
      continue;
    }
    try {
      const res = await applyLabelMotor({ supabase, tenantId, conversationId, labelId, via: 'system_hook' });
      if (res.applied) result.appliedLabels.push(name);
    } catch (err) {
      result.errors.push(`apply ${name}: ${(err as Error).message}`);
    }
  }

  return result;
}
