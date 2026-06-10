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
import { countActiveVisitFilters, type VisitFilterParams, type VisitStatus } from '@/lib/visit-list-query';

import type { MemberOption } from '@/lib/actions/members';
import { statusLabel } from './format';

const STATUSES: VisitStatus[] = ['scheduled', 'done', 'noshow', 'cancelled', 'rescheduled'];
const TYPE_OPTIONS: Array<{ key: 'any' | 'visit' | 'tasation'; label: string }> = [
  { key: 'any', label: 'Todas' },
  { key: 'visit', label: 'Visitas' },
  { key: 'tasation', label: 'Tasaciones' },
];

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

export function VisitsListFilters({
  filters,
  members,
  viewerId,
}: {
  filters: VisitFilterParams;
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

  const statuses = filters.statuses ?? [];
  const visitType = filters.visitType ?? 'any';
  const comercial = filters.comercial ?? 'any';
  const activeCount = countActiveVisitFilters(filters);

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
          placeholder="Lead, inmueble, comercial…"
          className="pl-8"
        />
      </div>

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

      <Group title="Tipo">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_OPTIONS.map((t) => (
            <Chip
              key={t.key}
              active={visitType === t.key}
              onClick={() => setParam('type', t.key === 'any' ? null : t.key)}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Comercial">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={comercial === 'any'} onClick={() => setParam('comercial', null)}>
              Cualquiera
            </Chip>
            <Chip active={comercial === 'mine'} onClick={() => setParam('comercial', 'mine')}>
              Mías
            </Chip>
          </div>
          {members.length > 0 && (
            <Select
              value={['any', 'mine'].includes(comercial) ? '' : comercial}
              onValueChange={(v) => setParam('comercial', v || null)}
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

      <Group title="Fechas">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={filters.scheduledFrom ?? ''}
            onChange={(e) => setParam('from', e.target.value || null)}
            aria-label="Desde"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            value={filters.scheduledTo ?? ''}
            onChange={(e) => setParam('to', e.target.value || null)}
            aria-label="Hasta"
          />
        </div>
      </Group>
    </div>
  );
}
