'use server';

/**
 * F5/F6 — Etiquetas del tenant (`tenant_labels`).
 *
 * - `listLabels` (F5): selector ligero para `/leads` (LabelOption). viewer+.
 * - `listLabelsAdmin` (F6): catálogo completo + conteo de uso para `/labels`. viewer+.
 * - `createLabel` / `updateLabel` / `deleteLabel` (F6): gestores (director_general+,
 *   = key `labels.manage` = RLS `tenant_labels` admin/dg). NUNCA service-role.
 *
 * `is_system=true`: protegidas — no se pueden borrar; al editar solo se aceptan
 * cambios de color/descripción/pausa/reactiva/auto-asignación. Nombre y
 * `destination_bucket` inmutables (forman la identidad del bucket). Esta protección
 * es de capa de aplicación (la RLS deja a un gestor modificar cualquier label del
 * tenant; el guard de system lo ponemos aquí).
 *
 * Las reglas de auto-etiquetado (`label_automation_rules`) se difieren a F9/F10
 * (inertes sin motor) — no se exponen en F6.
 */

import { revalidatePath } from 'next/cache';

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { AuthError, requireTenantRoleAtLeast } from '@/lib/auth/require-tenant-role';
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

export interface LabelAdminRow extends LabelOption {
  description: string | null;
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
}

export type LabelsResult = { ok: true; data: LabelOption[] } | { ok: false; error: string };
export type LabelAdminResult = { ok: true; data: LabelAdminRow[] } | { ok: false; error: string };
export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const VALID_BUCKETS: readonly DestinationBucket[] = [
  'chats',
  'hot',
  'done',
  'bought',
  'cancelled',
  'no_show',
  'recontact',
  'lost',
];

const LABEL_SELECT =
  'id, name, color, destination_bucket, is_system, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to';
const LABEL_ADMIN_SELECT =
  'id, name, color, description, destination_bucket, is_system, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to, created_at, updated_at';

function mapOption(r: Record<string, unknown>): LabelOption {
  return {
    id: Number(r.id),
    name: String(r.name),
    color: String(r.color),
    destinationBucket: (r.destination_bucket ?? null) as DestinationBucket | null,
    isSystem: Boolean(r.is_system),
    pauseAiOnApply: Boolean(r.pause_ai_on_apply),
    resumeAiOnApply: Boolean(r.resume_ai_on_apply),
    autoAssignTo: r.auto_assign_to == null ? null : Number(r.auto_assign_to),
  };
}

// ===========================================================================
// listLabels — selector ligero (/leads). viewer+.
// ===========================================================================

export async function listLabels(): Promise<LabelsResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tenant_labels')
    .select(LABEL_SELECT)
    .order('is_system', { ascending: false })
    .order('id', { ascending: true });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: (data ?? []).map((r) => mapOption(r as Record<string, unknown>)) };
}

// ===========================================================================
// listLabelsAdmin — catálogo completo + conteo de uso (/labels). viewer+.
// ===========================================================================

export async function listLabelsAdmin(): Promise<LabelAdminResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tenant_labels')
    .select(LABEL_ADMIN_SELECT)
    .order('is_system', { ascending: false })
    .order('id', { ascending: true });
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const labelIds = rows.map((l) => Number(l.id));

  // Conteo de uso: 2ª query desanidada (conversation_labels visibles vía RLS).
  const convCounts = new Map<number, number>();
  if (labelIds.length > 0) {
    const { data: convRows } = await supabase
      .from('conversation_labels')
      .select('label_id')
      .in('label_id', labelIds);
    for (const r of convRows ?? []) {
      const id = Number((r as { label_id: number }).label_id);
      convCounts.set(id, (convCounts.get(id) ?? 0) + 1);
    }
  }

  return {
    ok: true,
    data: rows.map((l) => ({
      ...mapOption(l),
      description: (l.description as string | null) ?? null,
      conversationCount: convCounts.get(Number(l.id)) ?? 0,
      createdAt: String(l.created_at),
      updatedAt: String(l.updated_at),
    })),
  };
}

// ===========================================================================
// Autorización de gestión (director_general+ = labels.manage).
// ===========================================================================

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ManageAuth =
  | { ok: true; tenantId: number; userId: number; supabase: SupabaseServer }
  | { ok: false; error: string };

async function authorizeManage(): Promise<ManageAuth> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };
  try {
    await requireTenantRoleAtLeast({ tenantId: eff.tenantId, minRole: 'owner' });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.code };
    throw e;
  }
  const supabase = await createSupabaseServerClient();
  return { ok: true, tenantId: eff.tenantId, userId: eff.userId, supabase };
}

function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'nombre vacío';
  if (n.length > 80) return 'nombre demasiado largo (>80)';
  return null;
}

// ===========================================================================
// createLabel
// ===========================================================================

export interface CreateLabelInput {
  name: string;
  color: string;
  description?: string;
  destinationBucket?: DestinationBucket | null;
  pauseAiOnApply?: boolean;
  resumeAiOnApply?: boolean;
  autoAssignTo?: number | null;
}

export async function createLabel(input: CreateLabelInput): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;

  const nameErr = validateName(input.name ?? '');
  if (nameErr) return { ok: false, error: nameErr };
  if (!HEX_COLOR_REGEX.test(input.color ?? '')) {
    return { ok: false, error: 'color inválido (esperado hex #RRGGBB)' };
  }
  if (input.destinationBucket != null && !VALID_BUCKETS.includes(input.destinationBucket)) {
    return { ok: false, error: 'destination_bucket inválido' };
  }

  const { data, error } = await auth.supabase
    .from('tenant_labels')
    .insert({
      tenant_id: auth.tenantId,
      name: input.name.trim(),
      color: input.color,
      description: input.description?.trim() || null,
      is_system: false,
      destination_bucket: input.destinationBucket ?? null,
      pause_ai_on_apply: input.pauseAiOnApply === true,
      resume_ai_on_apply: input.resumeAiOnApply === true,
      auto_assign_to: input.autoAssignTo ?? null,
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'ya existe una etiqueta con ese nombre' };
    return { ok: false, error: error?.message ?? 'insert failed' };
  }

  revalidateLabelConsumers();
  return { ok: true, data: { id: Number(data.id) } };
}

// ===========================================================================
// updateLabel
// ===========================================================================

export interface UpdateLabelPatch {
  name?: string;
  color?: string;
  description?: string | null;
  destinationBucket?: DestinationBucket | null;
  pauseAiOnApply?: boolean;
  resumeAiOnApply?: boolean;
  autoAssignTo?: number | null;
}

export async function updateLabel(input: {
  labelId: number;
  patch: UpdateLabelPatch;
}): Promise<ActionResult> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;

  const { data: existing, error: lookupErr } = await auth.supabase
    .from('tenant_labels')
    .select('id, is_system')
    .eq('id', input.labelId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: 'etiqueta no encontrada' };

  const isSystem = Boolean((existing as { is_system: unknown }).is_system);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.patch.name !== undefined) {
    if (isSystem) return { ok: false, error: 'no se puede renombrar una etiqueta del sistema' };
    const nameErr = validateName(input.patch.name);
    if (nameErr) return { ok: false, error: nameErr };
    updates.name = input.patch.name.trim();
  }
  if (input.patch.color !== undefined) {
    if (!HEX_COLOR_REGEX.test(input.patch.color)) {
      return { ok: false, error: 'color inválido (esperado hex #RRGGBB)' };
    }
    updates.color = input.patch.color;
  }
  if (input.patch.description !== undefined) {
    const desc = input.patch.description?.trim() ?? null;
    updates.description = desc && desc.length > 0 ? desc : null;
  }
  if (input.patch.destinationBucket !== undefined) {
    if (isSystem) return { ok: false, error: 'no se puede cambiar el bucket de una etiqueta del sistema' };
    if (input.patch.destinationBucket != null && !VALID_BUCKETS.includes(input.patch.destinationBucket)) {
      return { ok: false, error: 'destination_bucket inválido' };
    }
    updates.destination_bucket = input.patch.destinationBucket;
  }
  if (input.patch.pauseAiOnApply !== undefined) updates.pause_ai_on_apply = input.patch.pauseAiOnApply === true;
  if (input.patch.resumeAiOnApply !== undefined) updates.resume_ai_on_apply = input.patch.resumeAiOnApply === true;
  if (input.patch.autoAssignTo !== undefined) updates.auto_assign_to = input.patch.autoAssignTo ?? null;

  const { error: updateErr } = await auth.supabase
    .from('tenant_labels')
    .update(updates)
    .eq('id', input.labelId);
  if (updateErr) {
    if (updateErr.code === '23505') return { ok: false, error: 'ya existe una etiqueta con ese nombre' };
    return { ok: false, error: updateErr.message };
  }

  revalidateLabelConsumers();
  return { ok: true };
}

// ===========================================================================
// deleteLabel
// ===========================================================================

export async function deleteLabel(labelId: number): Promise<ActionResult> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;

  const { data: existing, error: lookupErr } = await auth.supabase
    .from('tenant_labels')
    .select('id, is_system')
    .eq('id', labelId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: 'etiqueta no encontrada' };
  if (Boolean((existing as { is_system: unknown }).is_system)) {
    return { ok: false, error: 'no se puede borrar una etiqueta del sistema' };
  }

  const { error } = await auth.supabase.from('tenant_labels').delete().eq('id', labelId);
  if (error) return { ok: false, error: error.message };

  revalidateLabelConsumers();
  return { ok: true };
}

function revalidateLabelConsumers(): void {
  revalidatePath('/labels');
  revalidatePath('/leads');
  revalidatePath('/conversations');
  revalidatePath('/pipeline');
}
