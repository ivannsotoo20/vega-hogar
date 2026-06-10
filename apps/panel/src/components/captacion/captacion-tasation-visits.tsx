import { ArrowRight, CalendarClock } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatDateTime,
  statusBadgeVariant,
  statusLabel,
} from '@/components/visits/format';
import type { VisitListRow } from '@/lib/visit-list-query';

export function CaptacionTasationVisits({ visits }: { visits: VisitListRow[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">Visitas de tasación</h2>
        <p className="text-sm text-muted-foreground">
          La tasación es una visita técnica <strong>humana</strong> agendada, no un cálculo automático.
        </p>
      </div>

      {visits.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No hay visitas de tasación agendadas ni realizadas.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visits.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <CalendarClock aria-hidden className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {v.lead?.full_name ?? `Lead #${v.lead_id}`}
                    </span>
                    <Badge variant={statusBadgeVariant(v.status)}>{statusLabel(v.status)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(v.scheduled_for)}</div>
                </div>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/visits?selected=${v.id}`}>
                  Ver visita <ArrowRight aria-hidden />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
