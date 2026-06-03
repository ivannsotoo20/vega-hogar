/**
 * Helpers puros para clasificar y filtrar la lista de leads inmobiliarios
 * (tabla `leads`). Port re-domain de setters_ia/lib/lead-list-query.ts.
 *
 * Diferencias con SETTER:
 *   - Lead inmobiliario: full_name, intent (comprador/vendedor), status. Sin
 *     first/last/username, sin tabla channels (canal = enum), sin provider.
 *   - Asignación a nivel LEAD (leads.assigned_to_user_id BIGINT), no por conversación.
 *   - Tabs por intent + buckets de label, como filtros independientes (no
 *     clasificación excluyente).
 *
 * La visibilidad por rol la aplica RLS (Fase 1), no este código.
 */

export type LeadTabKey = 'all' | 'buyers' | 'sellers' | 'hot' | 'closed';

export type LeadIntent = 'buyer' | 'tenant' | 'seller' | 'landlord' | 'unknown';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'scheduled_visit'
  | 'visited'
  | 'offer_made'
  | 'closed_won'
  | 'closed_lost'
  | 'cold';

export type DestinationBucket =
  | 'chats'
  | 'hot'
  | 'done'
  | 'bought'
  | 'cancelled'
  | 'no_show'
  | 'recontact'
  | 'lost';

export interface LeadListLabel {
  id: number;
  name: string;
  color: string;
  destination_bucket: DestinationBucket | null;
}

export interface LeadListConv {
  id: number;
  channel: string;
  status: string;
  current_phase: number;
  is_qualified: boolean | null;
  is_handoff_to_human: boolean;
  is_blocked: boolean;
  ai_paused_until: string | null;
  last_message_at: string | null;
  labels: LeadListLabel[];
}

export interface LeadListRow {
  id: number;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  intent: LeadIntent;
  status: LeadStatus;
  current_phase: number;
  assigned_to_user_id: number | null;
  external_id: string | null;
  notes: string | null;
  last_message_at: string | null;
  created_at: string;
  conversations: LeadListConv[];
}

export interface LeadFilterParams {
  q?: string;
  intents?: string[]; // buyer | tenant | seller | landlord | unknown
  statuses?: string[]; // LeadStatus
  phases?: number[]; // 0..7 sobre current_phase
  labelIds?: number[];
  assignee?: string; // 'any' | 'mine' | 'unassigned' | <userId>
  viewerId?: number | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  lastMsgFrom?: string | null;
  lastMsgTo?: string | null;
  lastMsgNever?: boolean;
  aiState?: 'active' | 'paused' | 'all';
  blocked?: 'yes' | 'no' | 'all';
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function getLastMessageAt(row: LeadListRow): string | null {
  if (row.last_message_at) return row.last_message_at;
  let max: string | null = null;
  for (const c of row.conversations) {
    if (!c.last_message_at) continue;
    if (max === null || c.last_message_at > max) max = c.last_message_at;
  }
  return max;
}

export function getMaxPhase(row: LeadListRow): number {
  let max = row.current_phase ?? 0;
  for (const c of row.conversations) {
    if (c.current_phase > max) max = c.current_phase;
  }
  return max;
}

export function getUniqueBuckets(row: LeadListRow): DestinationBucket[] {
  const set = new Set<DestinationBucket>();
  for (const c of row.conversations) {
    for (const l of c.labels) {
      if (l.destination_bucket) set.add(l.destination_bucket);
    }
  }
  return Array.from(set);
}

export function getUniqueLabelIds(row: LeadListRow): number[] {
  const set = new Set<number>();
  for (const c of row.conversations) {
    for (const l of c.labels) set.add(l.id);
  }
  return Array.from(set);
}

export function getUniqueLabels(row: LeadListRow): LeadListLabel[] {
  const seen = new Set<number>();
  const out: LeadListLabel[] = [];
  const all: LeadListLabel[] = [];
  for (const c of row.conversations) {
    for (const l of c.labels) all.push(l);
  }
  // System labels (con bucket) primero.
  for (const l of all) {
    if (l.destination_bucket && !seen.has(l.id)) {
      seen.add(l.id);
      out.push(l);
    }
  }
  for (const l of all) {
    if (!l.destination_bucket && !seen.has(l.id)) {
      seen.add(l.id);
      out.push(l);
    }
  }
  return out;
}

export function isAiPausedNow(rawUntil: string | null | undefined): boolean {
  if (!rawUntil) return false;
  if (rawUntil === 'infinity') return true;
  const ts = Date.parse(rawUntil);
  if (!Number.isFinite(ts)) return true;
  return ts > Date.now();
}

export function isLeadAiPaused(row: LeadListRow): boolean {
  return row.conversations.some(
    (c) => c.is_handoff_to_human || isAiPausedNow(c.ai_paused_until),
  );
}

export function isLeadBlocked(row: LeadListRow): boolean {
  return row.conversations.some((c) => c.is_blocked);
}

export function isBuyerIntent(intent: LeadIntent): boolean {
  return intent === 'buyer' || intent === 'tenant';
}

export function isSellerIntent(intent: LeadIntent): boolean {
  return intent === 'seller' || intent === 'landlord';
}

// ---------------------------------------------------------------------------
// Tabs (filtros rápidos independientes — un lead puede contar en varias)
// ---------------------------------------------------------------------------

const ALL_TABS: readonly LeadTabKey[] = ['all', 'buyers', 'sellers', 'hot', 'closed'];

function matchesTab(row: LeadListRow, tab: LeadTabKey): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'buyers':
      return isBuyerIntent(row.intent);
    case 'sellers':
      return isSellerIntent(row.intent);
    case 'hot':
      return getUniqueBuckets(row).includes('hot');
    case 'closed':
      return (
        row.status === 'closed_won' ||
        row.status === 'closed_lost' ||
        getUniqueBuckets(row).some((b) => b === 'bought' || b === 'lost')
      );
  }
}

export type LeadTabCounts = Record<LeadTabKey, number>;

export function leadTabCounts(rows: LeadListRow[]): LeadTabCounts {
  const counts: LeadTabCounts = { all: rows.length, buyers: 0, sellers: 0, hot: 0, closed: 0 };
  for (const r of rows) {
    if (matchesTab(r, 'buyers')) counts.buyers += 1;
    if (matchesTab(r, 'sellers')) counts.sellers += 1;
    if (matchesTab(r, 'hot')) counts.hot += 1;
    if (matchesTab(r, 'closed')) counts.closed += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function inRange(iso: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

export function applyFilters(rows: LeadListRow[], filters: LeadFilterParams): LeadListRow[] {
  const q = (filters.q ?? '').trim().toLowerCase();
  const intents = filters.intents ?? [];
  const statuses = filters.statuses ?? [];
  const phases = filters.phases ?? [];
  const labelIds = filters.labelIds ?? [];
  const assignee = filters.assignee ?? 'any';
  const viewerId = filters.viewerId ?? null;
  const createdFrom = filters.createdFrom ?? null;
  const createdTo = filters.createdTo ?? null;
  const lastMsgFrom = filters.lastMsgFrom ?? null;
  const lastMsgTo = filters.lastMsgTo ?? null;
  const lastMsgNever = filters.lastMsgNever === true;
  const aiState = filters.aiState ?? 'all';
  const blocked = filters.blocked ?? 'all';

  return rows.filter((row) => {
    if (q.length > 0) {
      const haystack = [row.full_name, row.phone, row.email, row.external_id, row.location, row.notes]
        .filter((v): v is string => v != null && v.length > 0)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (intents.length > 0 && !intents.includes(row.intent)) return false;
    if (statuses.length > 0 && !statuses.includes(row.status)) return false;

    if (phases.length > 0 && !phases.includes(getMaxPhase(row))) return false;

    if (!inRange(row.created_at, createdFrom, createdTo)) return false;

    const lastMsg = getLastMessageAt(row);
    if (lastMsgNever) {
      if (lastMsg !== null) return false;
    } else if (lastMsgFrom || lastMsgTo) {
      if (!inRange(lastMsg, lastMsgFrom, lastMsgTo)) return false;
    }

    if (labelIds.length > 0) {
      const ids = getUniqueLabelIds(row);
      if (!labelIds.some((id) => ids.includes(id))) return false;
    }

    if (assignee !== 'any') {
      if (assignee === 'unassigned') {
        if (row.assigned_to_user_id != null) return false;
      } else if (assignee === 'mine') {
        if (viewerId == null || row.assigned_to_user_id !== viewerId) return false;
      } else {
        const id = Number(assignee);
        if (!Number.isFinite(id) || row.assigned_to_user_id !== id) return false;
      }
    }

    if (aiState !== 'all') {
      const paused = isLeadAiPaused(row);
      if (aiState === 'paused' && !paused) return false;
      if (aiState === 'active' && paused) return false;
    }

    if (blocked !== 'all') {
      const isB = isLeadBlocked(row);
      if (blocked === 'yes' && !isB) return false;
      if (blocked === 'no' && isB) return false;
    }

    return true;
  });
}

export function rowsForTab(
  rows: LeadListRow[],
  tab: LeadTabKey,
  filters: LeadFilterParams,
): LeadListRow[] {
  const filtered = applyFilters(rows, filters);
  if (tab === 'all') return filtered;
  return filtered.filter((r) => matchesTab(r, tab));
}

// ---------------------------------------------------------------------------
// URL param parsers
// ---------------------------------------------------------------------------

export function parseLeadTab(value: string | null | undefined): LeadTabKey {
  if (value && (ALL_TABS as readonly string[]).includes(value)) return value as LeadTabKey;
  return 'all';
}

export function parseCsvIntList(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export function parseCsvStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseAiState(value: string | null | undefined): 'active' | 'paused' | 'all' {
  if (value === 'active' || value === 'paused') return value;
  return 'all';
}

export function parseTriState(value: string | null | undefined): 'yes' | 'no' | 'all' {
  if (value === 'yes' || value === 'no') return value;
  return 'all';
}

export function countActiveFilters(filters: LeadFilterParams): number {
  let n = 0;
  if ((filters.q ?? '').trim().length > 0) n += 1;
  if ((filters.intents ?? []).length > 0) n += 1;
  if ((filters.statuses ?? []).length > 0) n += 1;
  if ((filters.phases ?? []).length > 0) n += 1;
  if ((filters.labelIds ?? []).length > 0) n += 1;
  if ((filters.assignee ?? 'any') !== 'any') n += 1;
  if (filters.createdFrom || filters.createdTo) n += 1;
  if (filters.lastMsgFrom || filters.lastMsgTo || filters.lastMsgNever) n += 1;
  if ((filters.aiState ?? 'all') !== 'all') n += 1;
  if ((filters.blocked ?? 'all') !== 'all') n += 1;
  return n;
}
