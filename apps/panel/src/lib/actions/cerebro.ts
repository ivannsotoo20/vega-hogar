'use server';

/**
 * F9 / S1 — Server Actions del Cerebro (editor de prompts, `/admin/cerebro`).
 *
 * Decisión F9 #1/#1b (Iván): **PUBLICAR YA con BD-como-fuente-de-verdad** (modelo
 * SETTER). El editor publica desde la UI: borrador → snapshot de versión →
 * `UPDATE prompt_blocks`. El markdown del motor (F10) será artefacto downstream /
 * seed-si-vacío que NO pisa lo publicado por la UI (Regla 9 reescrita en S11).
 *
 * Doctrina Vega:
 *  - **anon + RLS** siempre (`createSupabaseServerClient`). NUNCA service-role
 *    (regla 2). Las tres tablas son **admin-only** por RLS (`06-agent-sys.sql` +
 *    `09-pipeline.sql`): `prompt_blocks` (select + modify FOR ALL, mismo predicado),
 *    `prompt_block_versions` (select; **INSERT admin habilitado por migración 016**),
 *    `prompt_block_drafts` (select + modify FOR ALL).
 *  - Gate de acción: **rol === 'admin' EXACTO** (la RLS exige `current_user_role()=
 *    'admin'`; el shim no expresa admin=5 vía minRole, así que se comprueba directo).
 *    La página añade el render-guard `isAgencyAdmin` (grupo "Agencia").
 *  - Cliente untyped → `.select('literal de una línea')`. Deny RLS de UPDATE = 0
 *    filas (no 42501) → comprobamos `.select()` posterior; deny de INSERT = 42501.
 *  - Sin `previewComposed` (no hay prompt-composer hasta F10) y **sin escritura .md**
 *    (Vercel sin filesystem; la BD es la verdad).
 *
 * Tipos de fila/scope viven en `@/lib/cerebro-list-query` (contrato estable).
 */

import { revalidatePath } from 'next/cache';

import type { EffectiveTenant } from '@/lib/auth/effective-tenant';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import {
  type BlockDetail,
  type BlockListRow,
  type VersionRef,
  deriveScope,
  draftMapKey,
} from '@/lib/cerebro-list-query';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

// Literales de una sola línea (si se concatenan, supabase-js degrada a GenericStringError).
const BLOCK_SELECT =
  'id, tenant_id, block_key, content, sort_order, is_active, version, created_at, updated_at';
const VERSION_LIST_SELECT =
  'id, prompt_block_id, version_number, changed_by, changed_at, change_summary, was_applied';
const DRAFT_SELECT =
  'id, block_key, tenant_id, content, base_version, owner_user_id, created_at, updated_at';

// ---------------------------------------------------------------------------
// Gate admin-exacto (RLS = última defensa)
// ---------------------------------------------------------------------------

type AdminAuth =
  | { ok: true; eff: EffectiveTenant; supabase: ServerClient }
  | { ok: false; error: string };

/** El Cerebro es admin-only (agency-level). Se comprueba `role === 'admin'` exacto. */
async function authorizeAdmin(): Promise<AdminAuth> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };
  if (eff.role !== 'admin') return { ok: false, error: 'FORBIDDEN_ROLE_REQUIRED' };
  const supabase = await createSupabaseServerClient();
  return { ok: true, eff, supabase };
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

function isValidId(id: number): boolean {
  return Number.isFinite(id) && id > 0;
}

function trimNullable(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/**
 * Aplica el matcher de tenant a un builder: shared (`tenant_id IS NULL`) vs `= id`.
 * Se castea a una interfaz mínima para evitar el "type instantiation excessively
 * deep" del genérico del query-builder untyped de supabase-js, y se devuelve el tipo
 * original para mantener el encadenado (`.maybeSingle()`, etc.).
 */
type TenantMatchable = {
  is(column: string, value: null): TenantMatchable;
  eq(column: string, value: number): TenantMatchable;
};
function matchTenant<Q>(builder: Q, tenantId: number | null): Q {
  const q = builder as unknown as TenantMatchable;
  return (tenantId == null ? q.is('tenant_id', null) : q.eq('tenant_id', tenantId)) as unknown as Q;
}

function mapBlockRow(raw: Record<string, unknown>, hasDraft: boolean): BlockListRow {
  const tenantId = raw.tenant_id != null ? Number(raw.tenant_id) : null;
  return {
    id: Number(raw.id),
    blockKey: String(raw.block_key),
    tenantId,
    scope: deriveScope(tenantId),
    sortOrder: Number(raw.sort_order ?? 0),
    isActive: raw.is_active === true,
    version: Number(raw.version ?? 1),
    hasDraft,
    updatedAt: String(raw.updated_at),
  };
}

// ---------------------------------------------------------------------------
// listBlocks — catálogo de bloques visibles + flag hasDraft del admin actual
// ---------------------------------------------------------------------------

export async function listBlocks(): Promise<ActionResult<BlockListRow[]>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const { data, error } = await supabase
    .from('prompt_blocks')
    .select(BLOCK_SELECT)
    .order('sort_order', { ascending: true })
    .order('block_key', { ascending: true });
  if (error) return { ok: false, error: error.message };

  // Drafts del admin actual → Set con la misma clave que el índice COALESCE.
  const { data: drafts, error: draftErr } = await supabase
    .from('prompt_block_drafts')
    .select('block_key, tenant_id')
    .eq('owner_user_id', eff.userId);
  if (draftErr) return { ok: false, error: draftErr.message };

  const draftKeys = new Set<string>();
  for (const d of (drafts ?? []) as Array<Record<string, unknown>>) {
    const tid = d.tenant_id != null ? Number(d.tenant_id) : null;
    draftKeys.add(draftMapKey(String(d.block_key), tid));
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((raw) => {
    const tenantId = raw.tenant_id != null ? Number(raw.tenant_id) : null;
    return mapBlockRow(raw, draftKeys.has(draftMapKey(String(raw.block_key), tenantId)));
  });

  return { ok: true, data: rows };
}

// ---------------------------------------------------------------------------
// getBlockDetail — bloque activo + borrador del admin + última versión
// ---------------------------------------------------------------------------

export async function getBlockDetail(
  blockKey: string,
  tenantId: number | null,
): Promise<ActionResult<BlockDetail>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const key = trimNullable(blockKey);
  if (!key) return { ok: false, error: 'invalid_block_key' };

  const { data: raw, error } = await matchTenant(
    supabase.from('prompt_blocks').select(BLOCK_SELECT).eq('block_key', key),
    tenantId,
  ).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!raw) return { ok: false, error: 'not_found' };

  const block = mapBlockRow(raw as Record<string, unknown>, false);

  // Última versión + borrador del admin, en paralelo.
  const [verRes, draftRes] = await Promise.all([
    supabase
      .from('prompt_block_versions')
      .select('version_number')
      .eq('prompt_block_id', block.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    matchTenant(
      supabase
        .from('prompt_block_drafts')
        .select(DRAFT_SELECT)
        .eq('block_key', key)
        .eq('owner_user_id', eff.userId),
      tenantId,
    ).maybeSingle(),
  ]);

  const latestVersionNumber =
    verRes.data != null ? Number((verRes.data as { version_number: number }).version_number) : null;

  let draft: BlockDetail['draft'] = null;
  if (draftRes.data) {
    const d = draftRes.data as Record<string, unknown>;
    draft = {
      content: String(d.content ?? ''),
      baseVersion: Number(d.base_version ?? block.version),
      updatedAt: String(d.updated_at),
    };
  }
  block.hasDraft = draft != null;

  return {
    ok: true,
    data: {
      block,
      activeContent: String((raw as Record<string, unknown>).content ?? ''),
      draft,
      latestVersionNumber,
    },
  };
}

// ---------------------------------------------------------------------------
// listVersions / loadVersionContent — histórico inmutable
// ---------------------------------------------------------------------------

export async function listVersions(
  promptBlockId: number,
  limit = 20,
): Promise<ActionResult<VersionRef[]>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  if (!isValidId(promptBlockId)) return { ok: false, error: 'invalid_block_id' };

  const { data, error } = await auth.supabase
    .from('prompt_block_versions')
    .select(VERSION_LIST_SELECT)
    .eq('prompt_block_id', promptBlockId)
    .order('version_number', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) return { ok: false, error: error.message };

  const rows: VersionRef[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    versionNumber: Number(r.version_number),
    changedAt: String(r.changed_at),
    changeSummary: (r.change_summary as string | null) ?? null,
    wasApplied: r.was_applied === true,
    changedBy: r.changed_by != null ? Number(r.changed_by) : null,
  }));
  return { ok: true, data: rows };
}

export async function loadVersionContent(
  versionId: number,
): Promise<ActionResult<{ versionNumber: number; content: string }>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  if (!isValidId(versionId)) return { ok: false, error: 'invalid_version_id' };

  const { data, error } = await auth.supabase
    .from('prompt_block_versions')
    .select('version_number, content')
    .eq('id', versionId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'not_found' };

  const d = data as Record<string, unknown>;
  return { ok: true, data: { versionNumber: Number(d.version_number), content: String(d.content ?? '') } };
}

// ---------------------------------------------------------------------------
// saveDraft / discardDraft — autosave del editor (upsert manual por índice COALESCE)
// ---------------------------------------------------------------------------

export async function saveDraft(input: {
  blockKey: string;
  tenantId: number | null;
  content: string;
  baseVersion: number;
}): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const key = trimNullable(input.blockKey);
  if (!key) return { ok: false, error: 'invalid_block_key' };
  const content = input.content ?? '';
  const baseVersion = Number.isFinite(input.baseVersion) ? Number(input.baseVersion) : 1;

  // PostgREST upsert no puede apuntar al índice único con COALESCE(tenant_id,-1) →
  // SELECT por (block_key, owner, tenant) y UPDATE/INSERT manual.
  const { data: existing, error: selErr } = await matchTenant(
    supabase
      .from('prompt_block_drafts')
      .select('id')
      .eq('block_key', key)
      .eq('owner_user_id', eff.userId),
    input.tenantId,
  ).maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };

  if (existing) {
    const { data, error } = await supabase
      .from('prompt_block_drafts')
      .update({ content, base_version: baseVersion }) // trigger set_updated_at refresca updated_at
      .eq('id', Number((existing as { id: number }).id))
      .select('updated_at');
    if (error) return { ok: false, error: error.message };
    if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'denied' };
    const updatedAt = String((data as Array<Record<string, unknown>>)[0].updated_at);
    return { ok: true, data: { updatedAt } };
  }

  const { data, error } = await supabase
    .from('prompt_block_drafts')
    .insert({
      block_key: key,
      tenant_id: input.tenantId,
      content,
      base_version: baseVersion,
      owner_user_id: eff.userId,
    })
    .select('updated_at')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, data: { updatedAt: String((data as Record<string, unknown>).updated_at) } };
}

export async function discardDraft(input: {
  blockKey: string;
  tenantId: number | null;
}): Promise<ActionResult> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const key = trimNullable(input.blockKey);
  if (!key) return { ok: false, error: 'invalid_block_key' };

  const { error } = await matchTenant(
    supabase.from('prompt_block_drafts').delete().eq('block_key', key).eq('owner_user_id', eff.userId),
    input.tenantId,
  );
  if (error) return { ok: false, error: error.message };

  revalidateCerebro(key);
  return { ok: true }; // 0 filas = nada que descartar (benigno)
}

// ---------------------------------------------------------------------------
// publishDraft — borrador → snapshot de versión → UPDATE prompt_blocks (BD = verdad)
// ---------------------------------------------------------------------------

export async function publishDraft(input: {
  blockKey: string;
  tenantId: number | null;
  changeSummary?: string | null;
}): Promise<ActionResult<{ newVersionNumber: number }>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  const key = trimNullable(input.blockKey);
  if (!key) return { ok: false, error: 'invalid_block_key' };
  const changeSummary = trimNullable(input.changeSummary);

  // (a) Borrador del admin.
  const { data: draftRaw, error: draftErr } = await matchTenant(
    supabase
      .from('prompt_block_drafts')
      .select('id, content, base_version')
      .eq('block_key', key)
      .eq('owner_user_id', eff.userId),
    input.tenantId,
  ).maybeSingle();
  if (draftErr) return { ok: false, error: draftErr.message };
  if (!draftRaw) return { ok: false, error: 'no_draft' };
  const draft = draftRaw as { id: number; content: string; base_version: number };

  // (b) Bloque activo.
  const { data: blockRaw, error: blockErr } = await matchTenant(
    supabase.from('prompt_blocks').select('id, content, version').eq('block_key', key),
    input.tenantId,
  ).maybeSingle();
  if (blockErr) return { ok: false, error: blockErr.message };

  if (blockRaw) {
    const block = blockRaw as { id: number; content: string; version: number };

    // Conflict-check: el borrador debe partir de la versión actual del bloque.
    if (Number(draft.base_version) !== Number(block.version)) {
      return { ok: false, error: 'version_conflict' };
    }

    // Auto-baseline: si el bloque no tiene NINGUNA versión todavía (caso seed),
    // snapshot del contenido ACTUAL como su versión actual antes de la nueva.
    const { data: anyVer } = await supabase
      .from('prompt_block_versions')
      .select('id')
      .eq('prompt_block_id', block.id)
      .limit(1)
      .maybeSingle();
    if (!anyVer) {
      const { error: baseErr } = await supabase.from('prompt_block_versions').insert({
        prompt_block_id: block.id,
        version_number: block.version,
        content: block.content,
        changed_by: eff.userId,
        change_summary: 'Versión inicial (baseline automática)',
        was_applied: true,
      });
      if (baseErr) return { ok: false, error: baseErr.message };
    }

    const next = Number(block.version) + 1;

    // Snapshot de la nueva versión (INSERT admin habilitado por migración 016).
    const { data: verData, error: verErr } = await supabase
      .from('prompt_block_versions')
      .insert({
        prompt_block_id: block.id,
        version_number: next,
        content: draft.content,
        changed_by: eff.userId,
        change_summary: changeSummary,
        was_applied: true,
      })
      .select('id')
      .single();
    if (verErr || !verData) return { ok: false, error: verErr?.message ?? 'version_insert_failed' };

    // UPDATE del bloque activo (deny RLS = 0 filas).
    const { data: updData, error: updErr } = await supabase
      .from('prompt_blocks')
      .update({ content: draft.content, version: next, updated_at: new Date().toISOString() })
      .eq('id', block.id)
      .select('id');
    if (updErr) return { ok: false, error: updErr.message };
    if (((updData ?? []) as unknown[]).length === 0) return { ok: false, error: 'denied' };

    await discardDraftRow(supabase, draft.id);
    revalidateCerebro(key);
    return { ok: true, data: { newVersionNumber: next } };
  }

  // (d) Bloque inexistente → crear en v1 (edge: hoy los 3 del seed existen).
  const { data: newBlock, error: insErr } = await supabase
    .from('prompt_blocks')
    .insert({
      block_key: key,
      tenant_id: input.tenantId,
      content: draft.content,
      sort_order: 0,
      is_active: true,
      version: 1,
    })
    .select('id')
    .single();
  if (insErr || !newBlock) return { ok: false, error: insErr?.message ?? 'block_insert_failed' };

  const { error: verErr } = await supabase.from('prompt_block_versions').insert({
    prompt_block_id: Number((newBlock as { id: number }).id),
    version_number: 1,
    content: draft.content,
    changed_by: eff.userId,
    change_summary: changeSummary,
    was_applied: true,
  });
  if (verErr) return { ok: false, error: verErr.message };

  await discardDraftRow(supabase, draft.id);
  revalidateCerebro(key);
  return { ok: true, data: { newVersionNumber: 1 } };
}

// ---------------------------------------------------------------------------
// restoreVersion — forward restore (nueva versión con contenido viejo)
// ---------------------------------------------------------------------------

export async function restoreVersion(input: {
  versionId: number;
}): Promise<ActionResult<{ newVersionNumber: number }>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const { eff, supabase } = auth;

  if (!isValidId(input.versionId)) return { ok: false, error: 'invalid_version_id' };

  const { data: ver, error: verErr } = await supabase
    .from('prompt_block_versions')
    .select('prompt_block_id, version_number, content')
    .eq('id', input.versionId)
    .maybeSingle();
  if (verErr) return { ok: false, error: verErr.message };
  if (!ver) return { ok: false, error: 'not_found' };
  const v = ver as { prompt_block_id: number; version_number: number; content: string };

  const { data: blockRaw, error: blockErr } = await supabase
    .from('prompt_blocks')
    .select('id, block_key, version')
    .eq('id', v.prompt_block_id)
    .maybeSingle();
  if (blockErr) return { ok: false, error: blockErr.message };
  if (!blockRaw) return { ok: false, error: 'block_not_found' };
  const block = blockRaw as { id: number; block_key: string; version: number };

  const next = Number(block.version) + 1;

  const { data: newVer, error: insErr } = await supabase
    .from('prompt_block_versions')
    .insert({
      prompt_block_id: block.id,
      version_number: next,
      content: v.content,
      changed_by: eff.userId,
      change_summary: `Restaurado desde v${v.version_number}`,
      was_applied: true,
    })
    .select('id')
    .single();
  if (insErr || !newVer) return { ok: false, error: insErr?.message ?? 'version_insert_failed' };

  const { data: updData, error: updErr } = await supabase
    .from('prompt_blocks')
    .update({ content: v.content, version: next, updated_at: new Date().toISOString() })
    .eq('id', block.id)
    .select('id');
  if (updErr) return { ok: false, error: updErr.message };
  if (((updData ?? []) as unknown[]).length === 0) return { ok: false, error: 'denied' };

  revalidateCerebro(block.block_key);
  return { ok: true, data: { newVersionNumber: next } };
}

// ---------------------------------------------------------------------------
// internos
// ---------------------------------------------------------------------------

async function discardDraftRow(supabase: ServerClient, draftId: number): Promise<void> {
  await supabase.from('prompt_block_drafts').delete().eq('id', draftId);
}

function revalidateCerebro(blockKey: string): void {
  revalidatePath('/admin/cerebro');
  revalidatePath(`/admin/cerebro/${blockKey}`);
}
