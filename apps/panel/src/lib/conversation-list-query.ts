/**
 * F6 — Tipos puros + helpers de `/conversations` (sin React → server y client).
 * Espeja `lead-list-query.ts` de F5 pero centrado en la conversación (el inbox),
 * no en el lead (el CRM). La visibilidad la impone la RLS (delegada al lead).
 */

import type { LeadIntent, LeadListLabel } from '@/lib/lead-list-query';

export type ConvTabKey = 'all' | 'unread' | 'handoff' | 'paused';

export interface ConversationListRow {
  id: number;
  lead_id: number;
  lead_name: string | null;
  lead_phone: string | null;
  intent: LeadIntent;
  channel: string;
  status: string;
  current_phase: number;
  ai_paused_until: string | null;
  is_handoff_to_human: boolean;
  is_unread: boolean;
  is_blocked: boolean;
  assigned_to_user_id: number | null;
  last_message_at: string | null;
  created_at: string;
  labels: LeadListLabel[];
}

export interface ConversationFilterParams {
  q?: string;
  channels?: string[];
  assignee?: string; // 'any' | 'mine' | 'unassigned' | '<userId>'
  labelIds?: number[];
  viewerId?: number | null;
}

/** IA en pausa: `'infinity'` o una fecha futura. */
export function isConvAiPaused(aiPausedUntil: string | null): boolean {
  if (!aiPausedUntil) return false;
  if (aiPausedUntil === 'infinity') return true;
  const t = Date.parse(aiPausedUntil);
  return Number.isFinite(t) ? t > Date.now() : true;
}

export interface ConvTabCounts {
  all: number;
  unread: number;
  handoff: number;
  paused: number;
}

export function convTabCounts(rows: ConversationListRow[]): ConvTabCounts {
  const c: ConvTabCounts = { all: rows.length, unread: 0, handoff: 0, paused: 0 };
  for (const r of rows) {
    if (r.is_unread) c.unread++;
    if (r.is_handoff_to_human) c.handoff++;
    if (isConvAiPaused(r.ai_paused_until)) c.paused++;
  }
  return c;
}

export function matchesConvTab(row: ConversationListRow, tab: ConvTabKey): boolean {
  switch (tab) {
    case 'unread':
      return row.is_unread;
    case 'handoff':
      return row.is_handoff_to_human;
    case 'paused':
      return isConvAiPaused(row.ai_paused_until);
    default:
      return true;
  }
}

/** Post-filtros que SQL no expresa (cruzan labels / asignación del lead). */
export function applyConvFilters(
  rows: ConversationListRow[],
  filters: { labelIds?: number[]; assignee?: string; viewerId?: number | null },
): ConversationListRow[] {
  let out = rows;

  if (filters.labelIds && filters.labelIds.length > 0) {
    const want = new Set(filters.labelIds);
    out = out.filter((r) => r.labels.some((l) => want.has(l.id)));
  }

  if (filters.assignee && filters.assignee !== 'any') {
    if (filters.assignee === 'unassigned') {
      out = out.filter((r) => r.assigned_to_user_id == null);
    } else if (filters.assignee === 'mine') {
      out = out.filter((r) => r.assigned_to_user_id === filters.viewerId);
    } else {
      const id = Number(filters.assignee);
      if (Number.isFinite(id)) out = out.filter((r) => r.assigned_to_user_id === id);
    }
  }

  return out;
}

export function rowsForConvTab(
  rows: ConversationListRow[],
  tab: ConvTabKey,
  filters: ConversationFilterParams,
): ConversationListRow[] {
  const filtered = applyConvFilters(rows, {
    labelIds: filters.labelIds,
    assignee: filters.assignee,
    viewerId: filters.viewerId,
  });
  return filtered.filter((r) => matchesConvTab(r, tab));
}

// --- parsers de searchParams ---

export function parseConvTab(value: string | null | undefined): ConvTabKey {
  return value === 'unread' || value === 'handoff' || value === 'paused' ? value : 'all';
}

export function parseCsvStrings(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseCsvInts(value: string | null | undefined): number[] {
  return parseCsvStrings(value)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

export function countActiveConvFilters(filters: ConversationFilterParams): number {
  let n = 0;
  if (filters.q && filters.q.trim()) n++;
  if (filters.channels && filters.channels.length > 0) n++;
  if (filters.assignee && filters.assignee !== 'any') n++;
  if (filters.labelIds && filters.labelIds.length > 0) n++;
  return n;
}
