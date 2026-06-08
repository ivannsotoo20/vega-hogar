'use client';

import { useOptimistic, useState, useTransition } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';

import {
  columnsForTrack,
  isOutcomeKey,
  OUTCOME_BUCKETS,
  phaseNumberFromKey,
  type ColumnKey,
  type OutcomeBucket,
  type PhaseKey,
  type PipelineTrack,
} from '@/lib/pipeline-constants';
import {
  applyOutcome,
  movePhase,
  removeOutcome,
  type PipelineCard as PipelineCardData,
} from '@/lib/actions/pipeline';

import { PipelineColumn } from './pipeline-column';
import { PipelineCardOverlay } from './pipeline-card-overlay';

type Columns = Record<ColumnKey, PipelineCardData[]>;
type MoveAction = { cardId: number; from: ColumnKey; to: ColumnKey };

/** Optimistic move: saca la card de `from`, la mete en `to`; si `to` es outcome,
 * la quita de cualquier otro outcome (exclusión mutua). Si la action falla, React
 * descarta el optimistic al terminar la transition. */
function moveReducer(state: Columns, action: MoveAction): Columns {
  const { cardId, from, to } = action;
  const card =
    state[from]?.find((c) => c.id === cardId) ??
    Object.values(state)
      .flat()
      .find((c) => c.id === cardId);
  if (!card) return state;

  const next: Columns = { ...state };
  next[from] = (state[from] ?? []).filter((c) => c.id !== cardId);

  if (isOutcomeKey(to)) {
    for (const col of OUTCOME_BUCKETS) {
      if (col !== to) next[col] = (next[col] ?? state[col] ?? []).filter((c) => c.id !== cardId);
    }
  }

  next[to] = [card, ...(next[to] ?? state[to] ?? []).filter((c) => c.id !== cardId)];
  return next;
}

export function PipelineBoard({
  track,
  columns,
  meta,
  canDrag,
  assigneeMap,
}: {
  track: PipelineTrack;
  columns: Columns;
  meta: Record<ColumnKey, { label: string; color: string }>;
  canDrag: boolean;
  assigneeMap: Record<number, string>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic(columns, moveReducer);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const order = columnsForTrack(track);
  const allCards = Object.values(optimistic).flat();
  const activeCard = activeId ? (allCards.find((c) => String(c.id) === activeId) ?? null) : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!canDrag || !event.over) return;
    const from = event.active.data.current?.columnId as ColumnKey | undefined;
    const to = (event.over.data.current?.columnId ?? event.over.id) as ColumnKey;
    if (!from || from === to) return;
    const conversationId = Number(event.active.id);
    if (!Number.isFinite(conversationId)) return;

    const toOutcome = isOutcomeKey(to);
    const fromOutcome = isOutcomeKey(from);

    startTransition(async () => {
      applyOptimistic({ cardId: conversationId, from, to });

      if (toOutcome) {
        const r = await applyOutcome({ conversationId, bucket: to as OutcomeBucket });
        if (!r.ok) toast.error(r.error);
        else toast.success('Resultado aplicado', { duration: 1500 });
        return;
      }

      // Destino = fase. Si venía de un outcome, primero quitar la etiqueta.
      if (fromOutcome) {
        const rm = await removeOutcome({ conversationId });
        if (!rm.ok) {
          toast.error(rm.error);
          return;
        }
      }
      const r = await movePhase({ conversationId, toPhase: phaseNumberFromKey(to as PhaseKey) });
      if (!r.ok) toast.error(r.error);
      else toast.success('Fase actualizada', { duration: 1500 });
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="h-full w-full overflow-x-auto overflow-y-hidden">
        <div className="flex h-full w-max gap-2.5 pb-3">
          {order.map((colId) => (
            <div key={colId} className="flex h-full items-stretch">
              {colId === 'cancelled' ? (
                <div className="mx-1.5 w-px shrink-0 bg-border/60" aria-hidden />
              ) : null}
              <PipelineColumn
                columnId={colId}
                label={meta[colId]?.label ?? colId}
                color={meta[colId]?.color ?? '#94a3b8'}
                isOutcome={isOutcomeKey(colId)}
                cards={optimistic[colId] ?? []}
                canDrag={canDrag}
                assigneeMap={assigneeMap}
              />
            </div>
          ))}
        </div>
      </div>
      <DragOverlay>{activeCard ? <PipelineCardOverlay card={activeCard} /> : null}</DragOverlay>
    </DndContext>
  );
}
