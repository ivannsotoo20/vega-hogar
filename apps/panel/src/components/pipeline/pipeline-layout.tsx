/**
 * F6 / S4 — Orquestador server de `/pipeline`. Fetch del board del track + members.
 * `pipeline.move` lo tienen todos los roles → `canDrag=true` (la RLS escopa qué
 * conversaciones ve cada uno). Datos seed/mock; el motor (F10) escribirá fases reales.
 */

import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { listPipelineBoard } from '@/lib/actions/pipeline';
import { listMembers } from '@/lib/actions/members';
import { columnMetaForTrack, type PipelineTrack } from '@/lib/pipeline-constants';

import { PipelineBoard } from './pipeline-board';

export async function PipelineLayout({ track }: { track: PipelineTrack }) {
  const eff = await getEffectiveTenant();
  if (!eff) return null;

  const [boardRes, membersRes] = await Promise.all([listPipelineBoard({ track }), listMembers()]);

  if (!boardRes.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudo cargar el pipeline: {boardRes.error}
      </div>
    );
  }

  const board = boardRes.data!;
  const members = membersRes.ok ? membersRes.data : [];
  const assigneeMap: Record<number, string> = {};
  for (const m of members) assigneeMap[m.id] = m.fullName ?? m.email;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {board.truncated ? (
        <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-1.5 text-xs text-warning">
          Mostrando las primeras conversaciones (board limitado por rendimiento).
        </p>
      ) : null}
      {board.total === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No hay conversaciones de {track === 'seller' ? 'vendedores' : 'compradores'} visibles.
        </div>
      ) : (
        <div className="min-h-[60vh] flex-1">
          <PipelineBoard
            key={track}
            track={track}
            columns={board.columns}
            meta={columnMetaForTrack(track)}
            canDrag
            assigneeMap={assigneeMap}
          />
        </div>
      )}
    </div>
  );
}
