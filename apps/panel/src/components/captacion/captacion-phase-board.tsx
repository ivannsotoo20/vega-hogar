import { ArrowUpRight, Building2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMaxPhase, type LeadListRow } from '@/lib/lead-list-query';
import { SELLER_PHASES, phaseKey } from '@/lib/pipeline-constants';

function intentLabel(intent: string): string {
  if (intent === 'seller') return 'Vendedor';
  if (intent === 'landlord') return 'Arrendador';
  return intent;
}

export function CaptacionPhaseBoard({
  leads,
  canCreateProperty,
}: {
  leads: LeadListRow[];
  canCreateProperty: boolean;
}) {
  // Agrupa los leads por fase del track seller (read-only; el board arrastrable
  // sigue siendo /pipeline?track=seller).
  const byPhase = new Map<string, LeadListRow[]>();
  for (const p of SELLER_PHASES) byPhase.set(p.key, []);
  for (const l of leads) {
    const key = phaseKey(getMaxPhase(l));
    byPhase.get(key)?.push(l);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Funnel de captación</h2>
          <p className="text-sm text-muted-foreground">
            Vendedores y arrendadores por fase del proceso de tasación.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/pipeline?track=seller">
            Abrir en pipeline <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {SELLER_PHASES.map((phase) => {
          const items = byPhase.get(phase.key) ?? [];
          return (
            <div
              key={phase.key}
              className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/20 p-2"
            >
              <div className="flex items-center justify-between px-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: phase.color }}
                  />
                  {phase.name}
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </div>

              {items.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">—</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((l) => (
                    <li
                      key={l.id}
                      className="flex flex-col gap-2 rounded-md border border-border bg-card p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {l.full_name ?? `Lead #${l.id}`}
                        </span>
                        <Badge variant="outline">{intentLabel(l.intent)}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button asChild variant="ghost" size="xs">
                          <Link href={`/leads?selected=${l.id}`}>
                            Ver lead <ExternalLink aria-hidden />
                          </Link>
                        </Button>
                        {canCreateProperty && (
                          <Button asChild variant="ghost" size="xs">
                            <Link href={`/properties?new=1&fromLead=${l.id}`}>
                              <Building2 aria-hidden /> Dar de alta inmueble
                            </Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
