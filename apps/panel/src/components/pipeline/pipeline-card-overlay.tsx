'use client';

import { Badge } from '@/components/ui/badge';
import { initials } from '@/components/leads/format';
import type { PipelineCard as PipelineCardData } from '@/lib/actions/pipeline';

/** Preview de la card mientras se arrastra (DragOverlay). */
export function PipelineCardOverlay({ card }: { card: PipelineCardData }) {
  return (
    <div className="w-[236px] rotate-2 rounded-lg border border-primary/40 bg-card p-2.5 shadow-lg">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold uppercase text-primary">
          {initials(card.leadName)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-xs font-semibold text-foreground">
            {card.leadName ?? 'Sin nombre'}
          </span>
          <Badge variant="secondary" className="h-3.5 w-fit px-1 font-mono text-[8px]">
            F{card.phaseNumber}
          </Badge>
        </div>
      </div>
    </div>
  );
}
