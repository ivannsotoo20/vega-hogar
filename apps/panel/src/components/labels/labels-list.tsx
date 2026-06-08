'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LabelAdminRow } from '@/lib/actions/labels';
import type { MemberOption } from '@/lib/actions/members';

import { LabelChip } from './label-chip';
import { SystemBadge } from './system-badge';
import { bucketLabel } from './buckets';
import { EditLabelDialog } from './edit-label-dialog';
import { DeleteLabelDialog } from './delete-label-dialog';

interface Props {
  labels: LabelAdminRow[];
  members: MemberOption[];
  canManage: boolean;
}

export function LabelsList({ labels, members, canManage }: Props) {
  const [editing, setEditing] = useState<LabelAdminRow | null>(null);
  const [deleting, setDeleting] = useState<LabelAdminRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[280px]">Etiqueta</TableHead>
            <TableHead>Bucket</TableHead>
            <TableHead className="text-right">Conversaciones</TableHead>
            <TableHead>Acciones auto</TableHead>
            {canManage ? <TableHead className="w-[100px] text-right">&nbsp;</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {labels.map((l) => {
            const assignee = l.autoAssignTo ? members.find((m) => m.id === l.autoAssignTo) : null;
            return (
              <TableRow key={l.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <LabelChip size="md" label={{ id: l.id, name: l.name, color: l.color }} />
                    {l.isSystem ? <SystemBadge /> : null}
                  </div>
                  {l.description ? (
                    <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-muted-foreground">
                      {l.description}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {l.destinationBucket ? (
                    <Badge variant="outline" className="font-normal">
                      {bucketLabel(l.destinationBucket)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.conversationCount}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {l.pauseAiOnApply ? (
                      <Badge variant="outline" className="border-warning/40 bg-warning/5 text-[10px] font-normal text-warning">
                        Pausa IA
                      </Badge>
                    ) : null}
                    {l.resumeAiOnApply ? (
                      <Badge variant="outline" className="border-success/40 bg-success/5 text-[10px] font-normal text-success">
                        Reactiva IA
                      </Badge>
                    ) : null}
                    {assignee ? (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        @{assignee.fullName ?? assignee.email.split('@')[0]}
                      </Badge>
                    ) : null}
                    {!l.pauseAiOnApply && !l.resumeAiOnApply && !assignee ? (
                      <span className="text-[10px] italic text-muted-foreground">Sin acciones</span>
                    ) : null}
                  </div>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(l)} aria-label={`Editar ${l.name}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleting(l)}
                        disabled={l.isSystem}
                        title={l.isSystem ? 'Las etiquetas del sistema no se pueden borrar' : undefined}
                        className="text-destructive disabled:text-muted-foreground"
                        aria-label={`Borrar ${l.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {canManage && editing ? (
        <EditLabelDialog
          open={editing != null}
          onOpenChange={(o) => !o && setEditing(null)}
          label={editing}
          members={members}
        />
      ) : null}
      {canManage && deleting ? (
        <DeleteLabelDialog
          open={deleting != null}
          onOpenChange={(o) => !o && setDeleting(null)}
          label={deleting}
        />
      ) : null}
    </>
  );
}
