'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateLabel, type LabelAdminRow, type UpdateLabelPatch } from '@/lib/actions/labels';
import type { DestinationBucket } from '@/lib/lead-list-query';
import type { MemberOption } from '@/lib/actions/members';

import { ColorPicker } from './color-picker';
import { SystemBadge } from './system-badge';
import { ALL_BUCKETS, bucketLabel } from './buckets';

const NO_VALUE = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: LabelAdminRow;
  members: MemberOption[];
}

export function EditLabelDialog({ open, onOpenChange, label, members }: Props) {
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [description, setDescription] = useState(label.description ?? '');
  const [bucket, setBucket] = useState<DestinationBucket | null>(label.destinationBucket);
  const [pauseAi, setPauseAi] = useState(label.pauseAiOnApply);
  const [resumeAi, setResumeAi] = useState(label.resumeAiOnApply);
  const [autoAssignTo, setAutoAssignTo] = useState<number | null>(label.autoAssignTo);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    startTransition(async () => {
      const patch: UpdateLabelPatch = {
        color,
        description: description.trim() || null,
        pauseAiOnApply: pauseAi,
        resumeAiOnApply: resumeAi,
        autoAssignTo,
      };
      // Nombre y bucket solo si NO es system label.
      if (!label.isSystem) {
        if (name.trim() !== label.name) patch.name = name.trim();
        if (bucket !== label.destinationBucket) patch.destinationBucket = bucket;
      }
      const res = await updateLabel({ labelId: label.id, patch });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Etiqueta actualizada');
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar etiqueta {label.isSystem ? <SystemBadge /> : null}
          </DialogTitle>
          <DialogDescription>
            {label.isSystem
              ? 'El nombre y el bucket están bloqueados (etiqueta del sistema). Color, descripción y acciones sí son editables.'
              : 'Modifica nombre, color, bucket y acciones automáticas.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-label-name">Nombre</Label>
            <Input
              id="edit-label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={label.isSystem}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-label-desc">Descripción</Label>
            <Input
              id="edit-label-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-label-bucket">Mover a bucket</Label>
            <Select
              value={bucket ?? NO_VALUE}
              onValueChange={(v) => setBucket(v === NO_VALUE ? null : (v as DestinationBucket))}
              disabled={label.isSystem}
            >
              <SelectTrigger id="edit-label-bucket">
                <SelectValue placeholder="Sin bucket" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VALUE}>Sin bucket (solo visual)</SelectItem>
                {ALL_BUCKETS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {bucketLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Acciones automáticas</p>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="edit-label-pause" className="flex-1 cursor-pointer text-sm font-normal">
                Pausar IA al aplicar
              </Label>
              <Switch id="edit-label-pause" checked={pauseAi} onCheckedChange={setPauseAi} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="edit-label-resume" className="flex-1 cursor-pointer text-sm font-normal">
                Reactivar IA al aplicar
              </Label>
              <Switch id="edit-label-resume" checked={resumeAi} onCheckedChange={setResumeAi} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-label-assign">Auto-asignar a</Label>
            <Select
              value={autoAssignTo == null ? NO_VALUE : String(autoAssignTo)}
              onValueChange={(v) => setAutoAssignTo(v === NO_VALUE ? null : Number(v))}
            >
              <SelectTrigger id="edit-label-assign">
                <SelectValue placeholder="Sin auto-asignación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VALUE}>Sin auto-asignación</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.fullName ?? m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
