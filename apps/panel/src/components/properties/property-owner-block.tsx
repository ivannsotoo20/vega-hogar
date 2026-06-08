'use client';

import { useState, useTransition } from 'react';
import { Loader2, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  addPropertyOwner,
  removePropertyOwner,
  updatePropertyOwner,
} from '@/lib/actions/properties';
import type { PropertyOwnerRow } from '@/lib/property-list-query';

type OwnerForm = { fullName: string; phone: string; email: string; notes: string };

const EMPTY: OwnerForm = { fullName: '', phone: '', email: '', notes: '' };

export function PropertyOwnerBlock({
  propertyId,
  owners,
  canManage,
}: {
  propertyId: number;
  owners: PropertyOwnerRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<OwnerForm>(EMPTY);

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

  function startAdd() {
    setForm(EMPTY);
    setEditingId(null);
    setAdding(true);
  }

  function startEdit(o: PropertyOwnerRow) {
    setForm({
      fullName: o.full_name,
      phone: o.phone ?? '',
      email: o.email ?? '',
      notes: o.notes ?? '',
    });
    setAdding(false);
    setEditingId(o.id);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY);
  }

  function save() {
    if (!form.fullName.trim()) return;
    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editingId != null) {
      run(() => updatePropertyOwner({ propertyId, ownerId: editingId, patch: payload }), 'Propietario actualizado', cancel);
    } else {
      run(() => addPropertyOwner({ propertyId, ...payload }), 'Propietario añadido', cancel);
    }
  }

  const showForm = adding || editingId != null;

  return (
    <div className="flex flex-col gap-2">
      {owners.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sin propietario registrado.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {owners.map((o) => (
            <li key={o.id} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
              <UserRound aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">{o.full_name}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {o.phone && <span>{o.phone}</span>}
                  {o.email && <span>· {o.email}</span>}
                </div>
                {o.notes && <p className="mt-1 text-xs text-muted-foreground">{o.notes}</p>}
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label="Editar propietario"
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    disabled={pending}
                    onClick={() => startEdit(o)}
                  >
                    <Pencil aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar propietario"
                    className="rounded p-1 text-destructive hover:bg-muted"
                    disabled={pending}
                    onClick={() => run(() => removePropertyOwner({ propertyId, ownerId: o.id }), 'Propietario eliminado')}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {editingId != null ? 'Editar propietario' : 'Nuevo propietario'}
            </p>
            <button type="button" aria-label="Cancelar" className="rounded p-1 hover:bg-muted" onClick={cancel}>
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} maxLength={120} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Teléfono</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <div>
            <Button size="sm" onClick={save} disabled={pending || !form.fullName.trim()}>
              {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        </div>
      )}

      {canManage && !showForm && (
        <div>
          <Button size="sm" variant="outline" onClick={startAdd} disabled={pending}>
            <Plus aria-hidden /> Añadir propietario
          </Button>
        </div>
      )}
    </div>
  );
}
