'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { createLabel } from '@/lib/actions/labels';
import type { DestinationBucket } from '@/lib/lead-list-query';
import type { MemberOption } from '@/lib/actions/members';

import { ColorPicker } from './color-picker';
import { ALL_BUCKETS, bucketLabel } from './buckets';

const NO_VALUE = '__none__';

export function AddLabelDialog({ members }: { members: MemberOption[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5c6f44');
  const [description, setDescription] = useState('');
  const [bucket, setBucket] = useState<DestinationBucket | null>(null);
  const [pauseAi, setPauseAi] = useState(false);
  const [resumeAi, setResumeAi] = useState(false);
  const [autoAssignTo, setAutoAssignTo] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setName('');
    setColor('#5c6f44');
    setDescription('');
    setBucket(null);
    setPauseAi(false);
    setResumeAi(false);
    setAutoAssignTo(null);
  };

  const onSubmit = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await createLabel({
        name: name.trim(),
        color,
        description: description.trim() || undefined,
        destinationBucket: bucket,
        pauseAiOnApply: pauseAi,
        resumeAiOnApply: resumeAi,
        autoAssignTo,
      });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Etiqueta creada');
      reset();
      setOpen(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Nueva etiqueta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva etiqueta</DialogTitle>
          <DialogDescription>
            Crea una etiqueta visual con acciones automáticas opcionales.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label-name">Nombre</Label>
            <Input
              id="label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Objeción precio"
              maxLength={80}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label-desc">Descripción (opcional)</Label>
            <Input
              id="label-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para qué sirve esta etiqueta"
              maxLength={200}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label-bucket">Mover a bucket (opcional)</Label>
            <Select
              value={bucket ?? NO_VALUE}
              onValueChange={(v) => setBucket(v === NO_VALUE ? null : (v as DestinationBucket))}
            >
              <SelectTrigger id="label-bucket">
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
            <p className="text-[10px] text-muted-foreground">
              Los buckets terminales (Cerrado, Perdido, No-show…) son columnas del pipeline.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Acciones automáticas</p>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="label-pause" className="flex-1 cursor-pointer text-sm font-normal">
                Pausar IA al aplicar
              </Label>
              <Switch id="label-pause" checked={pauseAi} onCheckedChange={setPauseAi} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="label-resume" className="flex-1 cursor-pointer text-sm font-normal">
                Reactivar IA al aplicar
              </Label>
              <Switch id="label-resume" checked={resumeAi} onCheckedChange={setResumeAi} />
            </div>
            {pauseAi && resumeAi ? (
              <p className="text-[10px] text-warning">
                Pausar y reactivar son contradictorios. Si ambos están activos, ganará reactivar.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label-assign">Auto-asignar a (opcional)</Label>
            <Select
              value={autoAssignTo == null ? NO_VALUE : String(autoAssignTo)}
              onValueChange={(v) => setAutoAssignTo(v === NO_VALUE ? null : Number(v))}
            >
              <SelectTrigger id="label-assign">
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
            <p className="text-[10px] text-muted-foreground">
              Solo se asigna si el lead no tiene asignación manual previa.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
