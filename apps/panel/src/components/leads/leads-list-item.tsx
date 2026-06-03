'use client';

import { Pause, Tag } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getMaxPhase,
  getUniqueLabels,
  isLeadAiPaused,
  type LeadListRow,
} from '@/lib/lead-list-query';

import { formatShortDate, initials, intentBadgeVariant, intentLabel, statusLabel } from './format';

export function LeadsListItem({
  row,
  isSelected,
  assigneeName,
}: {
  row: LeadListRow;
  isSelected: boolean;
  assigneeName: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function open() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('selected', String(row.id));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const phase = getMaxPhase(row);
  const aiPaused = isLeadAiPaused(row);
  const labels = getUniqueLabels(row).slice(0, 3);
  const lastMsg = row.last_message_at;

  return (
    <button
      type="button"
      onClick={open}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        isSelected ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/50',
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {initials(row.full_name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-foreground">
            {row.full_name ?? 'Sin nombre'}
          </span>
          <Badge variant={intentBadgeVariant(row.intent)}>{intentLabel(row.intent)}</Badge>
          {aiPaused && (
            <Badge variant="warning" title="IA en pausa">
              <Pause aria-hidden /> IA
            </Badge>
          )}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{statusLabel(row.status)}</span>
          <span aria-hidden>·</span>
          <span>Fase {phase}</span>
          {row.phone && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{row.phone}</span>
            </>
          )}
        </span>

        {labels.length > 0 && (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {labels.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: l.color }}
                  aria-hidden
                />
                {l.name}
              </span>
            ))}
          </span>
        )}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
        <span className="text-xs text-muted-foreground">{formatShortDate(lastMsg)}</span>
        <span className="max-w-[8rem] truncate text-xs text-muted-foreground">
          {assigneeName ?? 'Sin asignar'}
        </span>
        {labels.length === 0 && row.conversations.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Tag aria-hidden className="size-3" /> {row.conversations.length}
          </span>
        )}
      </span>
    </button>
  );
}
