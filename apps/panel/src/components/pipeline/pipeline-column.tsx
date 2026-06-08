'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { cn } from '@/lib/utils';
import type { ColumnKey } from '@/lib/pipeline-constants';
import type { PipelineCard as PipelineCardData } from '@/lib/actions/pipeline';

import { PipelineCard } from './pipeline-card';

export function PipelineColumn({
  columnId,
  label,
  color,
  isOutcome,
  cards,
  canDrag,
  assigneeMap,
}: {
  columnId: ColumnKey;
  label: string;
  color: string;
  isOutcome: boolean;
  cards: PipelineCardData[];
  canDrag: boolean;
  assigneeMap: Record<number, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId, data: { columnId } });

  return (
    <div
      className={cn(
        'flex h-full min-w-[250px] max-w-[250px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/30 transition-all duration-150',
        isOver && 'border-primary/60 bg-primary/[0.04] ring-2 ring-primary/40',
      )}
      aria-label={label}
    >
      <div className="h-[3px] w-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
            {label}
          </span>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
            cards.length > 0 ? 'bg-foreground/10 text-foreground/80' : 'text-muted-foreground/50',
          )}
        >
          {cards.length}
        </span>
      </div>

      <div ref={setNodeRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        <SortableContext items={cards.map((c) => String(c.id))} strategy={verticalListSortingStrategy}>
          {cards.length === 0 ? (
            <div className="pt-6 text-center text-[10px] italic text-muted-foreground/60">
              {isOutcome ? 'Sin resultados' : 'Vacío'}
            </div>
          ) : (
            cards.map((c) => (
              <PipelineCard
                key={c.id}
                card={c}
                columnId={columnId}
                canDrag={canDrag}
                assigneeLabel={c.assignedUserId != null ? (assigneeMap[c.assignedUserId] ?? null) : null}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
