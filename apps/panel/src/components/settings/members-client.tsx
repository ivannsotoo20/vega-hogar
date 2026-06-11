'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  assignMemberOffice,
  toggleMemberActive,
  unassignMemberOffice,
  updateMemberRole,
} from '@/lib/actions/members';
import { createInvite, resendInvite, revokeInvite, type InviteRow } from '@/lib/actions/invites';
import { ROLE_HIERARCHY, type UserRole } from '@/lib/auth/types';
import type { OfficeOption } from '@/lib/actions/offices';

export interface MemberRow {
  id: number;
  fullName: string | null;
  email: string;
  role: UserRole;
  active: boolean;
  officeIds: number[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  director_general: 'Dir. general',
  director_oficina: 'Dir. oficina',
  comercial: 'Comercial',
  asistente_captador: 'Asist. captador',
};

const ERROR_LABELS: Record<string, string> = {
  last_admin: 'Debe quedar al menos un admin activo.',
  cannot_deactivate_self: 'No puedes desactivarte a ti mismo.',
  ROLE_TOO_HIGH: 'No puedes asignar un rol superior al tuyo.',
  ALREADY_ACTIVE: 'Ya hay una invitación activa para ese email.',
  invalid_email: 'Email no válido.',
};

const INVITE_STATE_LABEL: Record<InviteRow['state'], string> = {
  active: 'Activa',
  accepted: 'Aceptada',
  revoked: 'Revocada',
  expired: 'Caducada',
};

function label(err: string): string {
  return ERROR_LABELS[err] ?? err;
}

export function MembersClient({
  members: initialMembers,
  offices,
  invites,
  viewerId,
  viewerRole,
}: {
  members: MemberRow[];
  offices: OfficeOption[];
  invites: InviteRow[];
  viewerId: number;
  viewerRole: UserRole;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [isPending, startTransition] = useTransition();

  // Invitar
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<UserRole>('comercial');
  const [invOffice, setInvOffice] = useState<string>('none');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const officeName = (id: number) => offices.find((o) => o.id === id)?.name ?? `Oficina ${id}`;
  // Roles que el viewer puede asignar (≤ su jerarquía).
  const assignableRoles = (Object.keys(ROLE_LABELS) as UserRole[]).filter(
    (r) => ROLE_HIERARCHY[r] <= ROLE_HIERARCHY[viewerRole],
  );

  function onRoleChange(id: number, role: UserRole) {
    const prev = members.find((m) => m.id === id)?.role;
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, role } : m)));
    startTransition(async () => {
      const res = await updateMemberRole(id, role);
      if (!res.ok) {
        setMembers((ms) => ms.map((m) => (m.id === id && prev ? { ...m, role: prev } : m)));
        toast.error(label(res.error));
      } else {
        toast.success('Rol actualizado');
      }
    });
  }

  function onActiveToggle(id: number, active: boolean) {
    const prev = members.find((m) => m.id === id)?.active ?? true;
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, active } : m)));
    startTransition(async () => {
      const res = await toggleMemberActive(id, active);
      if (!res.ok) {
        setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, active: prev } : m)));
        toast.error(label(res.error));
      } else {
        toast.success(active ? 'Miembro activado' : 'Miembro desactivado');
      }
    });
  }

  function onAddOffice(id: number, officeId: number) {
    startTransition(async () => {
      const res = await assignMemberOffice(id, officeId);
      if (!res.ok) toast.error(label(res.error));
      else {
        toast.success('Oficina asignada');
        router.refresh();
      }
    });
  }

  function onRemoveOffice(id: number, officeId: number) {
    startTransition(async () => {
      const res = await unassignMemberOffice(id, officeId);
      if (!res.ok) toast.error(label(res.error));
      else {
        toast.success('Oficina desasignada');
        router.refresh();
      }
    });
  }

  function onCreateInvite() {
    if (!invEmail.trim()) {
      toast.error('Introduce un email.');
      return;
    }
    startTransition(async () => {
      const res = await createInvite({
        email: invEmail,
        role: invRole,
        officeId: invOffice === 'none' ? null : Number(invOffice),
      });
      if (!res.ok) {
        toast.error(label(res.error));
        return;
      }
      setGeneratedLink(res.data!.acceptUrl);
      setInvEmail('');
      toast.success('Invitación creada. Copia el enlace y envíaselo.');
      router.refresh();
    });
  }

  function onRevoke(id: number) {
    startTransition(async () => {
      const res = await revokeInvite(id);
      if (!res.ok) toast.error(label(res.error));
      else {
        toast.success('Invitación revocada');
        router.refresh();
      }
    });
  }

  function onResend(id: number) {
    startTransition(async () => {
      const res = await resendInvite(id);
      if (!res.ok) {
        toast.error(label(res.error));
        return;
      }
      setGeneratedLink(res.data!.acceptUrl);
      setInviteOpen(true);
      toast.success('Nuevo enlace generado');
      router.refresh();
    });
  }

  async function copyLink() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar. Selecciona y copia manualmente.');
    }
  }

  const pending = invites.filter((i) => i.state === 'active');

  return (
    <div className="flex flex-col gap-6">
      {/* Miembros */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="p-3 font-medium">Miembro</th>
              <th className="p-3 font-medium">Rol</th>
              <th className="p-3 font-medium">Oficinas</th>
              <th className="p-3 text-center font-medium">Activo</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const availableOffices = offices.filter((o) => !m.officeIds.includes(o.id));
              const isSelf = m.id === viewerId;
              return (
                <tr key={m.id} className="border-t align-top">
                  <td className="p-3">
                    <div className="font-medium">{m.fullName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </td>
                  <td className="p-3">
                    <Select
                      value={m.role}
                      disabled={isPending}
                      onValueChange={(v) => onRoleChange(m.id, v as UserRole)}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRoles.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {m.officeIds.map((oid) => (
                        <Badge key={oid} variant="outline" className="gap-1">
                          {officeName(oid)}
                          <button
                            type="button"
                            className="ml-1 text-muted-foreground hover:text-destructive"
                            disabled={isPending}
                            onClick={() => onRemoveOffice(m.id, oid)}
                            aria-label={`Quitar ${officeName(oid)}`}
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                      {availableOffices.length > 0 ? (
                        <Select disabled={isPending} onValueChange={(v) => onAddOffice(m.id, Number(v))}>
                          <SelectTrigger className="h-7 w-[120px] text-xs">
                            <SelectValue placeholder="+ oficina" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableOffices.map((o) => (
                              <SelectItem key={o.id} value={String(o.id)}>
                                {o.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <Switch
                      checked={m.active}
                      disabled={isPending || isSelf}
                      onCheckedChange={(v) => onActiveToggle(m.id, v)}
                      aria-label={`Activo para ${m.fullName ?? m.email}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Invitar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Invitaciones</h3>
          <p className="text-xs text-muted-foreground">
            {pending.length} pendiente(s). El invitado acepta con el enlace que generes.
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setGeneratedLink(null); }}>
          <DialogTrigger asChild>
            <Button disabled={isPending}>Invitar miembro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invitar miembro</DialogTitle>
              <DialogDescription>
                Genera un enlace de invitación y envíaselo. El invitado crea su acceso con ese
                email.
              </DialogDescription>
            </DialogHeader>

            {generatedLink ? (
              <div className="grid gap-2 py-2">
                <Label>Enlace de invitación (cópialo y envíalo)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={generatedLink} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={copyLink}>
                    Copiar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Caduca en 7 días. Un solo uso.</p>
              </div>
            ) : (
              <div className="grid gap-3 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="inv-email">Email</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    placeholder="persona@ejemplo.com"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Rol</Label>
                  <Select value={invRole} onValueChange={(v) => setInvRole(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Oficina (opcional)</Label>
                  <Select value={invOffice} onValueChange={setInvOffice}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin oficina" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin oficina</SelectItem>
                      {offices.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter>
              {generatedLink ? (
                <Button variant="outline" onClick={() => setGeneratedLink(null)}>
                  Crear otra
                </Button>
              ) : (
                <Button onClick={onCreateInvite} disabled={isPending}>
                  Generar enlace
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {invites.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Rol</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="p-3">{i.email}</td>
                  <td className="p-3">{ROLE_LABELS[i.role]}</td>
                  <td className="p-3">
                    <Badge variant={i.state === 'active' ? 'secondary' : 'outline'}>
                      {INVITE_STATE_LABEL[i.state]}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    {i.state === 'active' ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" disabled={isPending} onClick={() => onResend(i.id)}>
                          Reenviar
                        </Button>
                        <Button variant="ghost" size="sm" disabled={isPending} onClick={() => onRevoke(i.id)}>
                          Revocar
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
