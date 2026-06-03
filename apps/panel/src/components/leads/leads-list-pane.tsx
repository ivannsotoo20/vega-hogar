'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import {
  leadTabCounts,
  rowsForTab,
  type LeadFilterParams,
  type LeadListRow,
  type LeadTabKey,
} from '@/lib/lead-list-query';
import { listLeadsPage, type CursorParam } from '@/lib/actions/leads';

import { LeadsListItem } from './leads-list-item';
import { LeadsListTabs } from './leads-list-tabs';

function dedupById(rows: LeadListRow[]): LeadListRow[] {
  const seen = new Set<number>();
  const out: LeadListRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export function LeadsListPane({
  initialRows,
  initialNextCursor,
  initialHasMore,
  selectedId,
  activeTab,
  filters,
  assigneeMap,
  pageSize,
}: {
  initialRows: LeadListRow[];
  initialNextCursor: CursorParam | null;
  initialHasMore: boolean;
  selectedId: number | null;
  activeTab: LeadTabKey;
  filters: LeadFilterParams;
  assigneeMap: Record<number, string>;
  pageSize: number;
}) {
  // El layout remonta este pane (vía `key`) cuando cambian filtros/tab, así que el
  // estado se inicializa desde las props del servidor sin setState-in-effect.
  const [rows, setRows] = useState<LeadListRow[]>(initialRows);
  const [cursor, setCursor] = useState<CursorParam | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isPending, startTransition] = useTransition();

  const loadMore = useCallback(() => {
    if (!hasMore || isPending || cursor == null) return;
    startTransition(async () => {
      const res = await listLeadsPage({ filters, cursor, limit: pageSize });
      if (!res.ok) {
        toast.error(`No se pudieron cargar más leads (${res.error})`);
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

  const counts = leadTabCounts(rows);
  const visible = rowsForTab(rows, activeTab, filters);

  return (
    <div className="flex flex-col gap-3">
      <LeadsListTabs active={activeTab} counts={counts} />

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? 'No hay leads que coincidan con estos filtros.'
            : 'Ningún lead en esta pestaña con los filtros actuales.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((row) => (
            <li key={row.id}>
              <LeadsListItem
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

      {isPending && (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {/* Sentinela para scroll infinito (keyset cursor server-side). */}
      <div ref={sentinelRef} className="h-1" />

      {!hasMore && rows.length > 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {rows.length} lead{rows.length === 1 ? '' : 's'} cargado{rows.length === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
