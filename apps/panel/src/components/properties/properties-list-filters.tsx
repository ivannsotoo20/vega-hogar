'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  countActivePropertyFilters,
  type PropertyFilterParams,
  type PropertyStatus,
  type PropertyType,
} from '@/lib/property-list-query';

import type { MemberOption } from '@/lib/actions/members';
import {
  FEATURE_KEYS,
  NEIGHBORHOODS,
  featureLabel,
  neighborhoodLabel,
  statusLabel,
  typeLabel,
} from './format';

const TYPES: PropertyType[] = ['sale', 'rent'];
const STATUSES: PropertyStatus[] = ['available', 'reserved', 'sold', 'rented', 'inactive'];
const ROOMS = [1, 2, 3, 4, 5];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible defaultOpen className="border-b border-border py-2">
      <CollapsibleTrigger className="group flex w-full items-center justify-between text-sm font-medium text-foreground">
        {title}
        <ChevronDown
          aria-hidden
          className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function PropertiesListFilters({
  filters,
  members,
  viewerId,
}: {
  filters: PropertyFilterParams;
  members: MemberOption[];
  viewerId: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value == null || value === '') params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setCsv = (key: string, values: (string | number)[]) =>
    setParam(key, values.length ? values.join(',') : null);

  const toggleStr = (key: string, current: string[], value: string) => {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setCsv(key, next);
  };

  // Búsqueda con debounce 250ms (sin re-escribir en el montaje).
  const [q, setQ] = useState(filters.q ?? '');
  useEffect(() => {
    const current = filters.q ?? '';
    if (q === current) return;
    const t = setTimeout(() => setParam('q', q.trim() || null), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Inputs numéricos: estado local, commit en blur (evita navegar por tecla).
  const [priceMin, setPriceMin] = useState(filters.priceMin != null ? String(filters.priceMin) : '');
  const [priceMax, setPriceMax] = useState(filters.priceMax != null ? String(filters.priceMax) : '');
  const [m2Min, setM2Min] = useState(filters.m2Min != null ? String(filters.m2Min) : '');

  const types = filters.types ?? [];
  const statuses = filters.statuses ?? [];
  const neighborhoods = filters.neighborhoods ?? [];
  const features = filters.features ?? [];
  const roomsMin = filters.roomsMin ?? null;
  const assignee = filters.assignee ?? 'any';
  const activeCount = countActivePropertyFilters(filters);

  return (
    <div className="flex flex-col text-sm">
      <div className="flex items-center justify-between pb-2">
        <span className="font-semibold text-foreground">Filtros</span>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setQ('');
              setPriceMin('');
              setPriceMax('');
              setM2Min('');
              router.replace(pathname, { scroll: false });
            }}
          >
            <X aria-hidden /> Limpiar ({activeCount})
          </Button>
        )}
      </div>

      <div className="relative pb-2">
        <Search aria-hidden className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Título, barrio, dirección…"
          className="pl-8"
        />
      </div>

      <Group title="Tipo">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <Chip key={t} active={types.includes(t)} onClick={() => toggleStr('types', types, t)}>
              {typeLabel(t)}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Estado">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <Chip
              key={s}
              active={statuses.includes(s)}
              onClick={() => toggleStr('statuses', statuses, s)}
            >
              {statusLabel(s)}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Barrio">
        <div className="flex flex-wrap gap-1.5">
          {NEIGHBORHOODS.map((n) => (
            <Chip
              key={n}
              active={neighborhoods.includes(n)}
              onClick={() => toggleStr('neighborhoods', neighborhoods, n)}
            >
              {neighborhoodLabel(n)}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Precio (€)">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            onBlur={() => setParam('priceMin', priceMin.trim() || null)}
            placeholder="Mín."
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            onBlur={() => setParam('priceMax', priceMax.trim() || null)}
            placeholder="Máx."
          />
        </div>
      </Group>

      <Group title="Habitaciones (mín.)">
        <div className="flex flex-wrap gap-1.5">
          {ROOMS.map((r) => (
            <Chip
              key={r}
              active={roomsMin === r}
              onClick={() => setParam('roomsMin', roomsMin === r ? null : String(r))}
            >
              {r === 5 ? '5+' : r}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Superficie (m² mín.)">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={m2Min}
          onChange={(e) => setM2Min(e.target.value)}
          onBlur={() => setParam('m2Min', m2Min.trim() || null)}
          placeholder="Ej. 80"
        />
      </Group>

      <Group title="Características">
        <div className="flex flex-wrap gap-1.5">
          {FEATURE_KEYS.map((f) => (
            <Chip
              key={f}
              active={features.includes(f)}
              onClick={() => toggleStr('features', features, f)}
            >
              {featureLabel(f)}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Asignación">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={assignee === 'any'} onClick={() => setParam('assignee', null)}>
              Cualquiera
            </Chip>
            <Chip active={assignee === 'mine'} onClick={() => setParam('assignee', 'mine')}>
              Míos
            </Chip>
            <Chip active={assignee === 'unassigned'} onClick={() => setParam('assignee', 'unassigned')}>
              Sin asignar
            </Chip>
          </div>
          {members.length > 0 && (
            <Select
              value={['any', 'mine', 'unassigned'].includes(assignee) ? '' : assignee}
              onValueChange={(v) => setParam('assignee', v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Comercial concreto…" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.fullName ?? m.email}
                    {m.id === viewerId ? ' (yo)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </Group>
    </div>
  );
}
