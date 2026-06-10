'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import {
  rowsForVisitTab,
  visitTabCounts,
  type VisitFilterParams,
  type VisitListRow,
  type VisitTabKey,
} from '@/lib/visit-list-query';
import { listVisitsPage, type VisitCursor } from '@/lib/actions/visits';

import { VisitsListItem } from './visits-list-item';
import { VisitsListTabs } from './visits-list-tabs';

function dedupById(rows: VisitListRow[]): VisitListRow[] {
  const seen = new Set<number>();
  const out: VisitListRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export function VisitsListPane({
  initialRows,
  initialNextCursor,
  initialHasMore,
  selectedId,
  activeTab,
  filters,
  pageSize,
}: {
  initialRows: VisitListRow[];
  initialNextCursor: VisitCursor | null;
  initialHasMore: boolean;
  selectedId: number | null;
  activeTab: VisitTabKey;
  filters: VisitFilterParams;
  pageSize: number;
}) {
  // El layout remonta este pane (vía `key`) cuando cambian filtros/tab, así que el
  // estado se inicializa desde las props del servidor sin setState-in-effect.
  const [rows, setRows] = useState<VisitListRow[]>(initialRows);
  const [cursor, setCursor] = useState<VisitCursor | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isPending, startTransition] = useTransition();

  const loadMore = useCallback(() => {
    if (!hasMore || isPending || cursor == null) return;
    startTransition(async () => {
      const res = await listVisitsPage({ filters, cursor, limit: pageSize });
      if (!res.ok) {
        toast.error(`No se pudieron cargar más visitas (${res.error})`);
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

  const counts = visitTabCounts(rows);
  const visible = rowsForVisitTab(rows, activeTab, filters);

  return (
    <div className="flex flex-col gap-3">
      <VisitsListTabs active={activeTab} counts={counts} />

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? 'No hay visitas que coincidan con estos filtros.'
            : 'Ninguna visita en esta pestaña con los filtros actuales.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((row) => (
            <li key={row.id}>
              <VisitsListItem row={row} isSelected={row.id === selectedId} />
            </li>
          ))}
        </ul>
      )}

      {isPending && (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {/* Sentinela para scroll infinito (keyset cursor server-side). */}
      <div ref={sentinelRef} className="h-1" />

      {!hasMore && rows.length > 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {rows.length} visita{rows.length === 1 ? '' : 's'} cargada{rows.length === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
