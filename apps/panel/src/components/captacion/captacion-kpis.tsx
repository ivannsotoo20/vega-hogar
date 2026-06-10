import { getMaxPhase, type LeadListRow } from '@/lib/lead-list-query';
import type { VisitListRow } from '@/lib/visit-list-query';

const CLOSED = new Set(['closed_won', 'closed_lost']);

export function CaptacionKpis({
  leads,
  tasations,
}: {
  leads: LeadListRow[];
  tasations: VisitListRow[];
}) {
  const active = leads.filter((l) => !CLOSED.has(l.status)).length;
  const inTasationPhase = leads.filter((l) => {
    const p = getMaxPhase(l);
    return p === 5 || p === 6; // Propuesta de tasación / Agenda de tasación
  }).length;
  const scheduledTas = tasations.filter((v) => v.status === 'scheduled').length;
  const doneTas = tasations.filter((v) => v.status === 'done').length;

  const cards = [
    { label: 'Captaciones activas', value: active, hint: 'Vendedores y arrendadores en curso' },
    { label: 'En fase de tasación', value: inTasationPhase, hint: 'Propuesta o agenda de tasación' },
    { label: 'Tasaciones agendadas', value: scheduledTas, hint: 'Visitas técnicas pendientes' },
    { label: 'Tasaciones realizadas', value: doneTas, hint: 'Visitas técnicas completadas' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-semibold tabular-nums text-foreground">{c.value}</div>
          <div className="text-sm font-medium text-foreground">{c.label}</div>
          <div className="text-xs text-muted-foreground">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
