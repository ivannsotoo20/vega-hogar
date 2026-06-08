'use client';

import { Pause, UserCheck } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isConvAiPaused, type ConversationListRow } from '@/lib/conversation-list-query';
import {
  channelLabel,
  formatShortDate,
  initials,
  intentBadgeVariant,
  intentLabel,
} from '@/components/leads/format';

import { convStatusLabel } from './format';

export function ConversationsListItem({
  row,
  isSelected,
  assigneeName,
}: {
  row: ConversationListRow;
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

  const paused = isConvAiPaused(row.ai_paused_until);
  const labels = row.labels.slice(0, 3);

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
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {initials(row.lead_name)}
        {row.is_unread ? (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-primary" aria-label="Sin leer" />
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={cn('truncate text-foreground', row.is_unread ? 'font-semibold' : 'font-medium')}>
            {row.lead_name ?? 'Sin nombre'}
          </span>
          <Badge variant={intentBadgeVariant(row.intent)}>{intentLabel(row.intent)}</Badge>
          {row.is_handoff_to_human ? (
            <Badge variant="accent" title="Derivada a humano">
              <UserCheck aria-hidden /> Handoff
            </Badge>
          ) : null}
          {paused ? (
            <Badge variant="warning" title="IA en pausa">
              <Pause aria-hidden /> IA
            </Badge>
          ) : null}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{channelLabel(row.channel)}</span>
          <span aria-hidden>·</span>
          <span>{convStatusLabel(row.status)}</span>
          <span aria-hidden>·</span>
          <span>Fase {row.current_phase}</span>
        </span>

        {labels.length > 0 ? (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {labels.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
                {l.name}
              </span>
            ))}
          </span>
        ) : null}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
        <span className="text-xs text-muted-foreground">{formatShortDate(row.last_message_at)}</span>
        <span className="max-w-[8rem] truncate text-xs text-muted-foreground">
          {assigneeName ?? 'Sin asignar'}
        </span>
      </span>
    </button>
  );
}
