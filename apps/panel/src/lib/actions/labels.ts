'use server';

/**
 * F5 / S4 — Catálogo de etiquetas del tenant para los selectores de `/leads`.
 * Lectura anon + RLS (`tenant_labels_select` acota al tenant). NUNCA service-role.
 */

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DestinationBucket } from '@/lib/lead-list-query';

export interface LabelOption {
  id: number;
  name: string;
  color: string;
  destinationBucket: DestinationBucket | null;
  isSystem: boolean;
  pauseAiOnApply: boolean;
  resumeAiOnApply: boolean;
  autoAssignTo: number | null;
}

export type LabelsResult = { ok: true; data: LabelOption[] } | { ok: false; error: string };

export async function listLabels(): Promise<LabelsResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tenant_labels')
    .select('id, name, color, destination_bucket, is_system, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to')
    .order('is_system', { ascending: false })
    .order('id', { ascending: true });
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    ok: true,
    data: rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      color: String(r.color),
      destinationBucket: (r.destination_bucket ?? null) as DestinationBucket | null,
      isSystem: Boolean(r.is_system),
      pauseAiOnApply: Boolean(r.pause_ai_on_apply),
      resumeAiOnApply: Boolean(r.resume_ai_on_apply),
      autoAssignTo: r.auto_assign_to == null ? null : Number(r.auto_assign_to),
    })),
  };
}
