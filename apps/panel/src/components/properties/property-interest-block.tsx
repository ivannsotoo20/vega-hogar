'use client';

import { useRef, useState, useTransition } from 'react';
import { ExternalLink, Loader2, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  addPropertyInterest,
  removePropertyInterest,
  updatePropertyInterestStatus,
} from '@/lib/actions/properties';
import { listLeadsPage } from '@/lib/actions/leads';
import type { PropertyInterestRow } from '@/lib/property-list-query';
import type { LeadListRow } from '@/lib/lead-list-query';

import { intentLabel, statusLabel } from '@/components/leads/format';

const INTEREST_STATUSES: Array<{ value: string; label: string }> = [
  { value: 'interested', label: 'Interesado' },
  { value: 'visited', label: 'Visitado' },
  { value: 'offer', label: 'Oferta' },
  { value: 'discarded', label: 'Descartado' },
];

function interestStatusLabel(status: string): string {
  return INTEREST_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function PropertyInterestBlock({
  propertyId,
  interests,
  canManage,
}: {
  propertyId: number;
  interests: PropertyInterestRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? 'Error');
        return;
      }
      toast.success(ok);
      after?.();
      router.refresh();
    });
  };

  // --- Buscador de leads para añadir interés ---
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LeadListRow[]>([]);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alreadyLinked = new Set(interests.map((i) => i.lead_id));

  // Debounce en el handler de cambio (no en un efecto → sin setState-in-effect).
  function onQueryChange(value: string) {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = value.trim();
    if (q.length < 2) {
      reqId.current += 1; // invalida búsquedas en vuelo
      setSearching(false);
      setResults([]);
      return;
    }
    setSearching(true);
    const myReq = ++reqId.current;
    timerRef.current = setTimeout(async () => {
      const res = await listLeadsPage({ filters: { q }, cursor: null, limit: 20 });
      if (myReq !== reqId.current) return; // resultado obsoleto
      setSearching(false);
      setResults(res.ok ? res.data!.rows : []);
    }, 300);
  }

  function resetSearch() {
    if (timerRef.current) clearTimeout(timerRef.current);
    reqId.current += 1;
    setQuery('');
    setResults([]);
    setSearching(false);
  }

  function addInterest(leadId: number) {
    run(() => addPropertyInterest({ propertyId, leadId }), 'Lead añadido a interesados', () => {
      resetSearch();
      setAdding(false);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {interests.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Ningún lead ha mostrado interés en este inmueble.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {interests.map((it) => (
            <li key={it.id} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={`/leads?selected=${it.lead_id}`}
                    className="truncate font-medium text-foreground hover:underline"
                  >
                    {it.lead?.full_name ?? `Lead #${it.lead_id}`}
                  </Link>
                  <ExternalLink aria-hidden className="size-3 text-muted-foreground" />
                  {it.lead && <Badge variant="outline">{intentLabel(it.lead.intent)}</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {it.lead && <span>{statusLabel(it.lead.status)}</span>}
                  {it.lead?.phone && <span>· {it.lead.phone}</span>}
                </div>
              </div>
              {canManage ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Select
                    value={it.status}
                    onValueChange={(v) =>
                      run(
                        () => updatePropertyInterestStatus({ propertyId, leadId: it.lead_id, status: v }),
                        'Estado actualizado',
                      )
                    }
                  >
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTEREST_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    aria-label="Quitar interés"
                    className="rounded p-1 text-destructive hover:bg-muted"
                    disabled={pending}
                    onClick={() =>
                      run(() => removePropertyInterest({ propertyId, leadId: it.lead_id }), 'Interés retirado')
                    }
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </div>
              ) : (
                <Badge variant="outline">{interestStatusLabel(it.status)}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && adding && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">Buscar lead</p>
            <button
              type="button"
              aria-label="Cancelar"
              className="rounded p-1 hover:bg-muted"
              onClick={() => {
                setAdding(false);
                resetSearch();
              }}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
          <div className="relative">
            <Search aria-hidden className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Nombre, teléfono, email…"
              className="pl-8"
              autoFocus
            />
          </div>
          {searching ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 aria-hidden className="size-3 animate-spin" /> Buscando…
            </p>
          ) : query.trim().length >= 2 && results.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin resultados.</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-auto">
              {results.map((lead) => {
                const linked = alreadyLinked.has(lead.id);
                return (
                  <li key={lead.id}>
                    <button
                      type="button"
                      disabled={pending || linked}
                      onClick={() => addInterest(lead.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {lead.full_name ?? `Lead #${lead.id}`}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {intentLabel(lead.intent)}
                        </span>
                      </span>
                      {linked ? (
                        <span className="text-xs text-muted-foreground">Ya añadido</span>
                      ) : (
                        <Plus aria-hidden className="size-3.5 shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {canManage && !adding && (
        <div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={pending}>
            <Plus aria-hidden /> Añadir lead interesado
          </Button>
        </div>
      )}
    </div>
  );
}
