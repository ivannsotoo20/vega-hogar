'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import {
  convTabCounts,
  rowsForConvTab,
  type ConversationFilterParams,
  type ConversationListRow,
  type ConvTabKey,
} from '@/lib/conversation-list-query';
import { listConversationsPage, type CursorParam } from '@/lib/actions/conversations';

import { ConversationsListItem } from './conversations-list-item';
import { ConversationsListTabs } from './conversations-list-tabs';

function dedupById(rows: ConversationListRow[]): ConversationListRow[] {
  const seen = new Set<number>();
  const out: ConversationListRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export function ConversationsListPane({
  initialRows,
  initialNextCursor,
  initialHasMore,
  selectedId,
  activeTab,
  filters,
  assigneeMap,
  pageSize,
}: {
  initialRows: ConversationListRow[];
  initialNextCursor: CursorParam | null;
  initialHasMore: boolean;
  selectedId: number | null;
  activeTab: ConvTabKey;
  filters: ConversationFilterParams;
  assigneeMap: Record<number, string>;
  pageSize: number;
}) {
  const [rows, setRows] = useState<ConversationListRow[]>(initialRows);
  const [cursor, setCursor] = useState<CursorParam | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isPending, startTransition] = useTransition();

  const loadMore = useCallback(() => {
    if (!hasMore || isPending || cursor == null) return;
    startTransition(async () => {
      const res = await listConversationsPage({ filters, cursor, limit: pageSize });
      if (!res.ok) {
        toast.error(`No se pudieron cargar más conversaciones (${res.error})`);
        return;
      }
      const data = res.data!;
      setRows((prev) => dedupById([...prev, ...data.rows]));
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    });
  }, [hasMore, isPending, cursor, filters, pageSize]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const counts = convTabCounts(rows);
  const visible = rowsForConvTab(rows, activeTab, filters);

  return (
    <div className="flex flex-col gap-3">
      <ConversationsListTabs active={activeTab} counts={counts} />

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? 'No hay conversaciones que coincidan con estos filtros.'
            : 'Ninguna conversación en esta pestaña con los filtros actuales.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((row) => (
            <li key={row.id}>
              <ConversationsListItem
                row={row}
                isSelected={row.id === selectedId}
                assigneeName={
                  row.assigned_to_user_id != null
                    ? (assigneeMap[row.assigned_to_user_id] ?? null)
                    : null
                }
              />
            </li>
          ))}
        </ul>
      )}

      {isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      <div ref={sentinelRef} className="h-1" />

      {!hasMore && rows.length > 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {rows.length} conversaci{rows.length === 1 ? 'ón' : 'ones'} cargada{rows.length === 1 ? '' : 's'}.
        </p>
      ) : null}
    </div>
  );
}
