'use client';

import { useState, useTransition } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createVisit } from '@/lib/actions/visits';
import type { MemberOption } from '@/lib/actions/members';

export interface SelectOption {
  id: number;
  label: string;
}

const NO_PROPERTY = '__none__';

export function AddVisitDialog({
  leads,
  properties,
  members,
  viewerId,
  canAssignOthers,
  isCaptador,
}: {
  leads: SelectOption[];
  properties: SelectOption[];
  members: MemberOption[];
  viewerId: number;
  canAssignOthers: boolean;
  isCaptador: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [leadId, setLeadId] = useState<string>('');
  const [type, setType] = useState<'visit' | 'tasation'>('visit');
  const [scheduledFor, setScheduledFor] = useState('');
  const [propertyId, setPropertyId] = useState<string>(NO_PROPERTY);
  const [comercialId, setComercialId] = useState<string>(String(viewerId));

  const isTasation = type === 'tasation';
  // Quién puede asignar a OTRO comercial al crear (D4c=G2): do+ siempre; el
  // asistente_captador solo cuando es una tasación. El resto (comercial) → a sí mismo.
  const canPickComercial = canAssignOthers || (isCaptador && isTasation);

  const reset = () => {
    setLeadId('');
    setType('visit');
    setScheduledFor('');
    setPropertyId(NO_PROPERTY);
    setComercialId(String(viewerId));
  };

  const onSubmit = () => {
    if (!leadId) {
      toast.error('Selecciona un lead');
      return;
    }
    if (!scheduledFor) {
      toast.error('Indica la fecha y hora de la visita');
      return;
    }
    startTransition(async () => {
      const res = await createVisit({
        leadId: Number(leadId),
        propertyId: propertyId === NO_PROPERTY ? null : Number(propertyId),
        comercialUserId: canPickComercial ? Number(comercialId) : undefined,
        scheduledFor,
        isTasation,
      });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success(isTasation ? 'Visita de tasación agendada' : 'Visita agendada');
      reset();
      setOpen(false);
      router.refresh();
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
          <CalendarPlus className="size-4" />
          Nueva visita
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva visita</DialogTitle>
          <DialogDescription>
            Agenda una visita comercial o una visita técnica de tasación (humana).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Lead</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un lead…" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'visit' | 'tasation')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visit">Visita</SelectItem>
                  <SelectItem value="tasation">Tasación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="visit-when">Fecha y hora</Label>
              <Input
                id="visit-when"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Inmueble (opcional)</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROPERTY}>Sin inmueble</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Comercial</Label>
            {canPickComercial ? (
              <Select value={comercialId} onValueChange={setComercialId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.fullName ?? m.email}
                      {m.id === viewerId ? ' (yo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {isCaptador
                  ? 'Las visitas normales se asignan a ti. Para asignar a otro comercial, marca el tipo «Tasación».'
                  : 'La visita se asignará a ti.'}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending || !leadId || !scheduledFor}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
