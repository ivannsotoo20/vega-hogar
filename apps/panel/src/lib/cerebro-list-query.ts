/**
 * Helpers puros del Cerebro (editor de prompts) — tipos de fila + scope + parsers,
 * sin I/O. Módulo NUEVO de F9; sigue el patrón de `visit-list-query.ts` /
 * `property-list-query.ts` (contrato estable consumido por la capa de datos y la UI).
 *
 * El Cerebro opera sobre tres tablas (Fase 4), todas **admin-only por RLS**
 * (`06-agent-sys.sql` + `09-pipeline.sql`):
 *   · `prompt_blocks`         — el bloque activo (fuente de verdad tras F9, modelo SETTER).
 *   · `prompt_block_versions` — histórico inmutable (snapshot por publish).
 *   · `prompt_block_drafts`   — autosave del editor (borrador por admin).
 *
 * Scope: `tenant_id IS NULL` → bloque "shared" (vale para cualquier tenant);
 * `tenant_id = <id>` → bloque del tenant. El índice único de drafts usa
 * `COALESCE(tenant_id, -1)`, así que el matching shared/tenant se hace con la misma
 * convención (`draftMapKey`).
 */

export type BlockScope = 'shared' | 'tenant';

/** Fila de la lista de bloques (`/admin/cerebro`). */
export interface BlockListRow {
  id: number;
  blockKey: string;
  tenantId: number | null;
  scope: BlockScope;
  sortOrder: number;
  isActive: boolean;
  version: number;
  /** ¿El admin actual tiene un borrador sin publicar para este bloque? */
  hasDraft: boolean;
  updatedAt: string;
}

/** Referencia ligera a una versión del histórico (sin contenido, para el dropdown). */
export interface VersionRef {
  id: number;
  versionNumber: number;
  changedAt: string;
  changeSummary: string | null;
  wasApplied: boolean;
  changedBy: number | null;
}

/** El borrador del admin actual sobre un bloque. */
export interface BlockDraft {
  content: string;
  baseVersion: number;
  updatedAt: string;
}

/** Ficha de un bloque: activo + borrador del admin + nº de la última versión. */
export interface BlockDetail {
  block: BlockListRow;
  activeContent: string;
  draft: BlockDraft | null;
  latestVersionNumber: number | null;
}

// ---------------------------------------------------------------------------
// Derived helpers (puros)
// ---------------------------------------------------------------------------

export function deriveScope(tenantId: number | null): BlockScope {
  return tenantId == null ? 'shared' : 'tenant';
}

/**
 * Clave de agrupación que replica el índice único de drafts
 * `(block_key, COALESCE(tenant_id, -1), owner_user_id)` a nivel de (blockKey, tenant).
 * Se usa para cruzar `prompt_blocks` con los drafts del owner sin segunda consulta.
 */
export function draftMapKey(blockKey: string, tenantId: number | null): string {
  return `${blockKey}|${tenantId ?? -1}`;
}

// ---------------------------------------------------------------------------
// URL param parsing (`/admin/cerebro/[blockKey]?tenant=shared|<id>`)
// ---------------------------------------------------------------------------

/** `'shared'`/ausente → null; numérico → tenantId; cualquier otra cosa → null. */
export function parseScopeParam(value: string | null | undefined): number | null {
  if (value == null || value === '' || value === 'shared') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Serializa el scope para la URL del deep-link. */
export function scopeParam(tenantId: number | null): string {
  return tenantId == null ? 'shared' : String(tenantId);
}
