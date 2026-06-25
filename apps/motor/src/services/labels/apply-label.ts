import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';

/**
 * Aplica una etiqueta a una conversación con INSERT idempotente + side effects
 * (pause/resume IA, auto-assign). Port de SETTER, tipado y re-domain:
 * `applied_by` es `users.id` BIGINT (number) en Vega, no UUID.
 *
 * Idempotente: si ya está aplicada → no-op (no re-ejecuta side effects). Crítico
 * porque `applySystemLabels` corre cada turno.
 */

export type AppliedVia = 'manual' | 'rule' | 'system_hook';

export interface ApplyLabelInput {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  conversationId: number;
  labelId: number;
  via: AppliedVia;
  actorUserId?: number | null;
}

export interface ApplyLabelResult {
  applied: boolean;
  sideEffectsApplied: { pausedAi: boolean; resumedAi: boolean; assignedUser: boolean };
}

const NOOP: ApplyLabelResult = {
  applied: false,
  sideEffectsApplied: { pausedAi: false, resumedAi: false, assignedUser: false },
};

export async function applyLabelMotor(input: ApplyLabelInput): Promise<ApplyLabelResult> {
  const { supabase, tenantId, conversationId, labelId, via, actorUserId } = input;

  // 1) Idempotencia.
  const { data: existing } = await supabase
    .from('conversation_labels')
    .select('label_id')
    .eq('conversation_id', conversationId)
    .eq('label_id', labelId)
    .maybeSingle();
  if (existing) return NOOP;

  // 2) Cargar la label (side effects).
  const { data: label } = await supabase
    .from('tenant_labels')
    .select('id, tenant_id, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to')
    .eq('id', labelId)
    .maybeSingle();
  if (!label) throw new Error(`applyLabelMotor: label ${labelId} no encontrada`);
  if (Number(label.tenant_id) !== tenantId) {
    throw new Error(`applyLabelMotor: label ${labelId} no pertenece a tenant ${tenantId}`);
  }

  // 3) INSERT idempotente.
  const { error: insertErr } = await supabase.from('conversation_labels').insert({
    conversation_id: conversationId,
    label_id: labelId,
    tenant_id: tenantId,
    applied_by: actorUserId ?? null,
    applied_via: via,
  });
  if (insertErr) {
    if ((insertErr as { code?: string }).code === '23505') return NOOP; // race → ya aplicada
    throw new Error(`applyLabelMotor: insert failed: ${insertErr.message}`);
  }

  // 4) Side effects.
  const sideEffects = { pausedAi: false, resumedAi: false, assignedUser: false };
  const { data: currentConv } = await supabase
    .from('conversations')
    .select('assigned_user_id')
    .eq('id', conversationId)
    .maybeSingle();
  const currentAssigned = (currentConv?.assigned_user_id as number | null) ?? null;

  const patch: Database['public']['Tables']['conversations']['Update'] = {};
  if (label.resume_ai_on_apply === true) {
    patch.ai_paused_until = null;
    sideEffects.resumedAi = true;
  } else if (label.pause_ai_on_apply === true) {
    patch.ai_paused_until = 'infinity';
    sideEffects.pausedAi = true;
  }
  if (label.auto_assign_to && !currentAssigned) {
    patch.assigned_user_id = Number(label.auto_assign_to);
    sideEffects.assignedUser = true;
  }
  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    await supabase.from('conversations').update(patch).eq('id', conversationId).eq('tenant_id', tenantId);
  }

  return { applied: true, sideEffectsApplied: sideEffects };
}
