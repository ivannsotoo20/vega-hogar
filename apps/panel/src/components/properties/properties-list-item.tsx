'use client';

import { Bath, BedDouble, Building2, Ruler } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PropertyListRow } from '@/lib/property-list-query';

import {
  neighborhoodLabel,
  priceLabel,
  statusBadgeVariant,
  statusLabel,
  typeBadgeVariant,
  typeLabel,
} from './format';

export function PropertiesListItem({
  row,
  isSelected,
  assigneeName,
}: {
  row: PropertyListRow;
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
      <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {row.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URLs externas arbitrarias (v1 sin Storage)
          <img
            src={row.thumbnail_url}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <Building2 aria-hidden className="size-6" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-foreground">{row.title}</span>
          <Badge variant={typeBadgeVariant(row.type)}>{typeLabel(row.type)}</Badge>
          <Badge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
        </span>

        <span className="mt-0.5 block text-sm font-semibold text-foreground">{priceLabel(row)}</span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Ruler aria-hidden className="size-3" /> {row.m2_built} m²
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <BedDouble aria-hidden className="size-3" /> {row.rooms}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Bath aria-hidden className="size-3" /> {row.bathrooms}
          </span>
          <span aria-hidden>·</span>
          <span className="truncate">{neighborhoodLabel(row.neighborhood)}</span>
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
        <span className="max-w-[8rem] truncate text-xs text-muted-foreground">
          {assigneeName ?? 'Sin asignar'}
        </span>
      </span>
    </button>
  );
}
