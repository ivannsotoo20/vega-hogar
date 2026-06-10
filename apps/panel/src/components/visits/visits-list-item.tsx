'use client';

import { Building2, CalendarClock, MapPin, UserRound } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { VisitListRow } from '@/lib/visit-list-query';

import {
  formatDateTime,
  statusBadgeVariant,
  statusLabel,
  visitTypeBadgeVariant,
  visitTypeLabel,
} from './format';

export function VisitsListItem({
  row,
  isSelected,
}: {
  row: VisitListRow;
  isSelected: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function open() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('selected', String(row.id));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const leadName = row.lead?.full_name ?? `Lead #${row.lead_id}`;
  const comercialName = row.comercial?.full_name ?? row.comercial?.email ?? 'Sin asignar';

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
      <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <CalendarClock aria-hidden className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-foreground">{leadName}</span>
          <Badge variant={visitTypeBadgeVariant(row.is_tasation)}>
            {visitTypeLabel(row.is_tasation)}
          </Badge>
          <Badge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
        </span>

        <span className="mt-0.5 block text-sm font-semibold text-foreground">
          {formatDateTime(row.scheduled_for)}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {row.property ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Building2 aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{row.property.title}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-3" /> Sin inmueble
            </span>
          )}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
        <span className="inline-flex max-w-[8rem] items-center gap-1 truncate text-xs text-muted-foreground">
          <UserRound aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{comercialName}</span>
        </span>
      </span>
    </button>
  );
}
