'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  countActiveConvFilters,
  type ConversationFilterParams,
} from '@/lib/conversation-list-query';
import { channelLabel } from '@/components/leads/format';
import type { LabelOption } from '@/lib/actions/labels';
import type { MemberOption } from '@/lib/actions/members';

const CHANNELS = ['whatsapp', 'voice', 'web_form', 'meta_ads', 'other'];

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

export function ConversationsListFilters({
  filters,
  labels,
}: {
  filters: ConversationFilterParams;
  labels: LabelOption[];
  members: MemberOption[];
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

  const toggleCsv = (key: string, current: (string | number)[], value: string | number) => {
    const has = current.includes(value);
    const next = has ? current.filter((v) => v !== value) : [...current, value];
    setParam(key, next.length ? next.join(',') : null);
  };

  const [q, setQ] = useState(filters.q ?? '');
  useEffect(() => {
    const current = filters.q ?? '';
    if (q === current) return;
    const t = setTimeout(() => setParam('q', q.trim() || null), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const channels = filters.channels ?? [];
  const labelIds = filters.labelIds ?? [];
  const assignee = filters.assignee ?? 'any';
  const activeCount = countActiveConvFilters(filters);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Filtros</span>
        {activeCount > 0 ? (
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
        ) : null}
      </div>

      <div className="relative">
        <Search aria-hidden className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre, teléfono, email…"
          className="pl-8"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Canal</span>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => (
            <Chip key={c} active={channels.includes(c)} onClick={() => toggleCsv('channels', channels, c)}>
              {channelLabel(c)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Asignación</span>
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
      </div>

      {labels.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Etiquetas</span>
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => (
              <Chip key={l.id} active={labelIds.includes(l.id)} onClick={() => toggleCsv('labels', labelIds, l.id)}>
                <span
                  className="mr-1 inline-block size-2 rounded-full align-middle"
                  style={{ backgroundColor: l.color }}
                  aria-hidden
                />
                {l.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
