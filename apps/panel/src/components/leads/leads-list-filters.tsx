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
  countActiveFilters,
  type LeadFilterParams,
  type LeadIntent,
  type LeadStatus,
} from '@/lib/lead-list-query';

import type { LabelOption } from '@/lib/actions/labels';
import type { MemberOption } from '@/lib/actions/members';
import { intentLabel, statusLabel } from './format';

const INTENTS: LeadIntent[] = ['buyer', 'tenant', 'seller', 'landlord', 'unknown'];
const STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'scheduled_visit',
  'visited',
  'offer_made',
  'closed_won',
  'closed_lost',
  'cold',
];
const PHASES = [0, 1, 2, 3, 4, 5, 6, 7];

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

export function LeadsListFilters({
  filters,
  labels,
  members,
  viewerId,
}: {
  filters: LeadFilterParams;
  labels: LabelOption[];
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

  const toggleNum = (key: string, current: number[], value: number) => {
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

  const intents = filters.intents ?? [];
  const statuses = filters.statuses ?? [];
  const phases = filters.phases ?? [];
  const labelIds = filters.labelIds ?? [];
  const assignee = filters.assignee ?? 'any';
  const aiState = filters.aiState ?? 'all';
  const activeCount = countActiveFilters(filters);

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
          placeholder="Nombre, teléfono, email…"
          className="pl-8"
        />
      </div>

      <Group title="Intención">
        <div className="flex flex-wrap gap-1.5">
          {INTENTS.map((i) => (
            <Chip key={i} active={intents.includes(i)} onClick={() => toggleStr('intents', intents, i)}>
              {intentLabel(i)}
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

      <Group title="Fase">
        <div className="flex flex-wrap gap-1.5">
          {PHASES.map((p) => (
            <Chip key={p} active={phases.includes(p)} onClick={() => toggleNum('phases', phases, p)}>
              {p}
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

      {labels.length > 0 && (
        <Group title="Etiquetas">
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => (
              <Chip
                key={l.id}
                active={labelIds.includes(l.id)}
                onClick={() => toggleNum('labels', labelIds, l.id)}
              >
                <span
                  className="mr-1 inline-block size-2 rounded-full align-middle"
                  style={{ backgroundColor: l.color }}
                  aria-hidden
                />
                {l.name}
              </Chip>
            ))}
          </div>
        </Group>
      )}

      <Group title="IA y fechas">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={aiState === 'all'} onClick={() => setParam('ai', null)}>
              IA: cualquiera
            </Chip>
            <Chip active={aiState === 'active'} onClick={() => setParam('ai', 'active')}>
              IA activa
            </Chip>
            <Chip active={aiState === 'paused'} onClick={() => setParam('ai', 'paused')}>
              IA pausada
            </Chip>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Creado desde
            <Input
              type="date"
              value={filters.createdFrom ?? ''}
              onChange={(e) => setParam('createdFrom', e.target.value || null)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Creado hasta
            <Input
              type="date"
              value={filters.createdTo ?? ''}
              onChange={(e) => setParam('createdTo', e.target.value || null)}
            />
          </label>
          <Chip
            active={filters.lastMsgNever === true}
            onClick={() => setParam('lastMsgNever', filters.lastMsgNever ? null : '1')}
          >
            Nunca respondió
          </Chip>
        </div>
      </Group>
    </div>
  );
}
