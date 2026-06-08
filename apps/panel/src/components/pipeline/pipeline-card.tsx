'use client';

import Link from 'next/link';
import { Pause } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { LabelChip } from '@/components/labels/label-chip';
import { channelLabel, initials } from '@/components/leads/format';
import { isConvAiPaused } from '@/lib/conversation-list-query';
import type { PipelineCard as PipelineCardData } from '@/lib/actions/pipeline';
import type { ColumnKey } from '@/lib/pipeline-constants';

export function PipelineCard({
  card,
  columnId,
  canDrag,
  assigneeLabel,
}: {
  card: PipelineCardData;
  columnId: ColumnKey;
  canDrag: boolean;
  assigneeLabel?: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(card.id),
    data: { columnId },
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const paused = isConvAiPaused(card.aiPausedUntil);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group rounded-lg border border-border/60 bg-card p-2.5 shadow-xs transition-[box-shadow,border-color]',
        'hover:border-primary/40 hover:shadow-md',
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
      )}
      aria-label={`Conversación de ${card.leadName ?? 'sin nombre'}`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold uppercase text-primary">
          {initials(card.leadName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={`/conversations?selected=${card.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="truncate text-xs font-semibold text-foreground transition-colors hover:text-primary"
          >
            {card.leadName ?? 'Sin nombre'}
          </Link>
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="h-3.5 px-1 text-[8px] font-normal">
              {channelLabel(card.channel)}
            </Badge>
            <Badge variant="secondary" className="h-3.5 px-1 font-mono text-[8px]">
              F{card.phaseNumber}
            </Badge>
            {paused ? <Pause className="size-2.5 shrink-0 text-warning" aria-label="IA pausada" /> : null}
          </div>
          {card.labels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {card.labels.slice(0, 2).map((l) => (
                <LabelChip key={l.id} size="mini" label={{ id: l.id, name: l.name, color: l.color }} />
              ))}
              {card.labels.length > 2 ? (
                <span className="text-[8px] tabular-nums text-muted-foreground">
                  +{card.labels.length - 2}
                </span>
              ) : null}
            </div>
          ) : null}
          {assigneeLabel ? (
            <span className="truncate text-[9px] text-muted-foreground">· {assigneeLabel}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
