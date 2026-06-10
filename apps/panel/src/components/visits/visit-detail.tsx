'use client';

import { useState, useTransition } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  Loader2,
  Pencil,
  RefreshCcw,
  UserCog,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  reassignVisit,
  updateVisitNotes,
  updateVisitStatus,
  type VisitDetail as VisitDetailData,
} from '@/lib/actions/visits';
import type { MemberOption } from '@/lib/actions/members';
import type { VisitStatus } from '@/lib/visit-list-query';

import {
  formatDateTime,
  formatShortDate,
  intentLabel,
  statusBadgeVariant,
  statusLabel,
  toDatetimeLocalValue,
  visitTypeBadgeVariant,
  visitTypeLabel,
} from './format';

/** Transiciones directas ofrecidas en el dropdown (la reprogramación es aparte). */
const NEXT_STATES: Record<VisitStatus, VisitStatus[]> = {
  scheduled: ['done', 'noshow', 'cancelled'],
  rescheduled: ['scheduled', 'done', 'noshow', 'cancelled'],
  done: [],
  noshow: [],
  cancelled: [],
};

/** Estados "activos" (admiten reprogramar / reasignar). */
const ACTIVE_STATES: VisitStatus[] = ['scheduled', 'rescheduled'];

export function VisitDetail({
  detail,
  members,
  viewerId,
  canReassign,
}: {
  detail: VisitDetailData;
  members: MemberOption[];
  viewerId: number;
  canReassign: boolean;
}) {
  const router = useRouter();
  const { visit } = detail;
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

  const isActive = ACTIVE_STATES.includes(visit.status);
  const nextStates = NEXT_STATES[visit.status];

  const leadName = visit.lead?.full_name ?? `Lead #${visit.lead_id}`;
  const comercialName = visit.comercial?.full_name ?? visit.comercial?.email ?? `#${visit.comercial_user_id}`;

  // --- Reprogramar ---
  const [reprogOpen, setReprogOpen] = useState(false);
  const [newWhen, setNewWhen] = useState(toDatetimeLocalValue(visit.scheduled_for));

  function doReschedule() {
    if (!newWhen) {
      toast.error('Indica la nueva fecha y hora');
      return;
    }
    run(
      () => updateVisitStatus({ visitId: visit.id, status: 'rescheduled', scheduledFor: newWhen }),
      'Visita reprogramada',
      () => setReprogOpen(false),
    );
  }

  // --- Notas ---
  const [editingNotes, setEditingNotes] = useState(false);
  const [outcome, setOutcome] = useState(visit.outcome_notes ?? '');
  const [feedback, setFeedback] = useState(visit.lead_feedback ?? '');

  function saveNotes() {
    run(
      () =>
        updateVisitNotes({
          visitId: visit.id,
          outcomeNotes: outcome.trim() || null,
          leadFeedback: feedback.trim() || null,
        }),
      'Notas guardadas',
      () => setEditingNotes(false),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">{leadName}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={visitTypeBadgeVariant(visit.is_tasation)}>
            {visitTypeLabel(visit.is_tasation)}
          </Badge>
          <Badge variant={statusBadgeVariant(visit.status)}>{statusLabel(visit.status)}</Badge>
        </div>
        <div className="inline-flex items-center gap-1.5 text-base font-semibold text-foreground">
          <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
          {formatDateTime(visit.scheduled_for)}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        {nextStates.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                <Check aria-hidden /> Cambiar estado
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Marcar la visita como…</DropdownMenuLabel>
              {nextStates.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() =>
                    run(
                      () => updateVisitStatus({ visitId: visit.id, status: s }),
                      `Estado: ${statusLabel(s)}`,
                    )
                  }
                >
                  {statusLabel(s)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {isActive && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setReprogOpen((v) => !v)}
          >
            <RefreshCcw aria-hidden /> Reprogramar
          </Button>
        )}

        {canReassign && isActive && members.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                <UserCog aria-hidden /> Reasignar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Asignar a comercial</DropdownMenuLabel>
              {members.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() =>
                    run(
                      () => reassignVisit({ visitId: visit.id, comercialUserId: m.id }),
                      `Reasignada a ${m.fullName ?? m.email}`,
                    )
                  }
                >
                  {m.id === visit.comercial_user_id && <Check aria-hidden className="size-3.5" />}
                  {m.fullName ?? m.email}
                  {m.id === viewerId ? ' (yo)' : ''}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {reprogOpen && isActive && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Label htmlFor="visit-reprog" className="text-xs text-muted-foreground">
            Nueva fecha y hora
          </Label>
          <Input
            id="visit-reprog"
            type="datetime-local"
            value={newWhen}
            onChange={(e) => setNewWhen(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={doReschedule} disabled={pending}>
              {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Check aria-hidden />}
              Reprogramar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReprogOpen(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <Separator />

      {/* Datos */}
      <div className="flex flex-col gap-2">
        <ReadField label="Lead" value={leadName} />
        <ReadField label="Teléfono" value={visit.lead?.phone ?? null} />
        <ReadField label="Intención" value={visit.lead ? intentLabel(visit.lead.intent) : null} />
        <ReadField
          label="Inmueble"
          value={visit.property ? visit.property.title : 'Sin inmueble asignado'}
        />
        <ReadField label="Comercial" value={comercialName} />
        <ReadField label="Tipo" value={visitTypeLabel(visit.is_tasation)} />
        <ReadField label="Estado" value={statusLabel(visit.status)} />
        <ReadField
          label="Cita de calendario"
          value={
            visit.calendar_appointment_id != null
              ? `Cita #${visit.calendar_appointment_id}`
              : 'Sin cita en calendario'
          }
        />
        <ReadField label="Creada" value={formatShortDate(visit.created_at)} />
      </div>

      {/* Enlaces de contexto */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/leads?selected=${visit.lead_id}`}>
            Ver lead <ArrowRight aria-hidden />
          </Link>
        </Button>
        {visit.property && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/properties?selected=${visit.property_id}`}>
              <Building2 aria-hidden /> Ver inmueble
            </Link>
          </Button>
        )}
      </div>

      <Separator />

      {/* Notas */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Notas</span>
          {!editingNotes && (
            <Button variant="ghost" size="xs" onClick={() => setEditingNotes(true)} disabled={pending}>
              <Pencil aria-hidden /> Editar
            </Button>
          )}
        </div>

        {editingNotes ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Resultado de la visita</Label>
              <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Feedback del lead</Label>
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveNotes} disabled={pending}>
                {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Check aria-hidden />}
                Guardar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOutcome(visit.outcome_notes ?? '');
                  setFeedback(visit.lead_feedback ?? '');
                  setEditingNotes(false);
                }}
                disabled={pending}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Resultado de la visita</span>
              <span className="whitespace-pre-wrap text-foreground">
                {visit.outcome_notes || '—'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Feedback del lead</span>
              <span className="whitespace-pre-wrap text-foreground">{visit.lead_feedback || '—'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right text-foreground">{value || '—'}</span>
    </div>
  );
}
