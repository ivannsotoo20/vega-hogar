'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { createProperty } from '@/lib/actions/properties';
import type { OfficeOption } from '@/lib/actions/offices';
import type { PropertyStatus, PropertyType } from '@/lib/property-list-query';

import { NEIGHBORHOODS, neighborhoodLabel, statusLabel, typeLabel } from './format';

const TYPES: PropertyType[] = ['sale', 'rent'];
const STATUSES: PropertyStatus[] = ['available', 'reserved', 'sold', 'rented', 'inactive'];

function num(s: string): number | null {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
}

export function AddPropertyDialog({
  offices,
  initialOpen = false,
}: {
  offices: OfficeOption[];
  initialOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<PropertyType>('sale');
  const [status, setStatus] = useState<PropertyStatus>('available');
  const [price, setPrice] = useState('');
  const [rent, setRent] = useState('');
  const [m2Built, setM2Built] = useState('');
  const [rooms, setRooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [neighborhood, setNeighborhood] = useState(NEIGHBORHOODS[0]);
  const [officeId, setOfficeId] = useState<number | null>(offices[0]?.id ?? null);
  const [description, setDescription] = useState('');

  const reset = () => {
    setTitle('');
    setType('sale');
    setStatus('available');
    setPrice('');
    setRent('');
    setM2Built('');
    setRooms('');
    setBathrooms('');
    setNeighborhood(NEIGHBORHOODS[0]);
    setOfficeId(offices[0]?.id ?? null);
    setDescription('');
  };

  const onSubmit = () => {
    if (!title.trim()) {
      toast.error('El título es obligatorio');
      return;
    }
    if (officeId == null) {
      toast.error('Selecciona una oficina');
      return;
    }
    const m2 = num(m2Built);
    if (m2 == null || m2 <= 0) {
      toast.error('Los m² construidos son obligatorios');
      return;
    }
    startTransition(async () => {
      const res = await createProperty({
        officeId,
        type,
        status,
        title: title.trim(),
        description: description.trim() || null,
        priceEur: num(price),
        monthlyRentEur: num(rent),
        m2Built: m2,
        rooms: num(rooms) ?? 0,
        bathrooms: num(bathrooms) ?? 0,
        neighborhood,
      });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Inmueble creado');
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
          <Plus className="size-4" />
          Nuevo inmueble
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo inmueble</DialogTitle>
          <DialogDescription>Alta de un inmueble del catálogo de Vega Hogar.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prop-title">Título</Label>
            <Input
              id="prop-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Piso reformado en Ruzafa con terraza"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as PropertyType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {typeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PropertyStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {type === 'sale' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prop-price">Precio (€)</Label>
              <Input id="prop-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prop-rent">Renta mensual (€)</Label>
              <Input id="prop-rent" type="number" value={rent} onChange={(e) => setRent(e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prop-m2">m² constr.</Label>
              <Input id="prop-m2" type="number" value={m2Built} onChange={(e) => setM2Built(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prop-rooms">Hab.</Label>
              <Input id="prop-rooms" type="number" value={rooms} onChange={(e) => setRooms(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prop-baths">Baños</Label>
              <Input id="prop-baths" type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Barrio</Label>
              <Select value={neighborhood} onValueChange={setNeighborhood}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEIGHBORHOODS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {neighborhoodLabel(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Oficina</Label>
              <Select
                value={officeId != null ? String(officeId) : ''}
                onValueChange={(v) => setOfficeId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Oficina…" />
                </SelectTrigger>
                <SelectContent>
                  {offices.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prop-desc">Descripción (opcional)</Label>
            <Textarea
              id="prop-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending || !title.trim()}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
