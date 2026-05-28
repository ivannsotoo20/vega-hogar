'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Login con password — cliente. Evita el doble redirect server action +
 * middleware que en Next 16 RSC navigation deja la URL desincronizada del
 * contenido renderizado.
 *
 * Las cookies de sesión las setea el cliente browser de Supabase
 * directamente, sin pasar por server action.
 */
export function PasswordLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!EMAIL_RE.test(cleanEmail)) {
      toast.error('Email no válido. Revisa el formato.');
      return;
    }
    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        toast.error(error.message.toLowerCase().includes('invalid')
          ? 'Email o contraseña incorrectos.'
          : `Error: ${error.message}`);
        return;
      }

      // Full reload para que el middleware vea la nueva cookie y enrute por rol.
      window.location.href = '/dashboard';
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="pw-email">Email</Label>
        <Input
          id="pw-email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pw-password">Contraseña</Label>
        <Input
          id="pw-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
        />
      </div>
      <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
        {isPending ? 'Accediendo…' : 'Acceder con contraseña'}
      </Button>
    </form>
  );
}
