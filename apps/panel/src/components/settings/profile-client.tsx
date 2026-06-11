'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePassword, updateDisplayName } from '@/lib/actions/profile';

const PW_ERRORS: Record<string, string> = {
  password_too_short: 'La contraseña debe tener al menos 8 caracteres.',
  invalid_name: 'Nombre no válido.',
};

export function ProfileClient({ initialFullName }: { initialFullName: string }) {
  const [fullName, setFullName] = useState(initialFullName);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isPending, startTransition] = useTransition();

  function onSaveName() {
    startTransition(async () => {
      const res = await updateDisplayName({ fullName });
      if (res.ok) toast.success('Nombre para mostrar actualizado');
      else toast.error(PW_ERRORS[res.error] ?? `No se pudo guardar: ${res.error}`);
    });
  }

  function onChangePassword() {
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }
    startTransition(async () => {
      const res = await changePassword({ newPassword: password });
      if (res.ok) {
        toast.success('Contraseña actualizada');
        setPassword('');
        setConfirm('');
      } else {
        toast.error(PW_ERRORS[res.error] ?? `No se pudo cambiar: ${res.error}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid max-w-md gap-2">
        <Label htmlFor="display-name">Nombre para mostrar</Label>
        <Input
          id="display-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Tu nombre"
        />
        <p className="text-xs text-muted-foreground">
          Se guarda en tu cuenta. El nombre oficial en la organización lo gestiona un
          administrador en Miembros.
        </p>
        <Button className="w-fit" onClick={onSaveName} disabled={isPending}>
          Guardar nombre
        </Button>
      </div>

      <div className="grid max-w-md gap-2 border-t pt-6">
        <Label htmlFor="new-password">Nueva contraseña</Label>
        <Input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
        />
        <Label htmlFor="confirm-password" className="mt-2">
          Repite la contraseña
        </Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        <Button className="w-fit" variant="outline" onClick={onChangePassword} disabled={isPending}>
          Cambiar contraseña
        </Button>
      </div>
    </div>
  );
}
