'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CLAIM_ERRORS: Record<string, string> = {
  EMAIL_MISMATCH: 'El email no coincide con la invitación. Usa el email al que te invitaron.',
  INVITE_EXPIRED: 'La invitación ha caducado. Pide una nueva a tu administrador.',
  INVITE_REVOKED: 'La invitación fue revocada. Pide una nueva a tu administrador.',
  INVITE_ALREADY_USED: 'Esta invitación ya se usó. Inicia sesión con tu cuenta.',
  INVITE_NOT_FOUND: 'Invitación no encontrada. Revisa el enlace.',
};

function mapClaimError(message: string): string {
  for (const key of Object.keys(CLAIM_ERRORS)) {
    if (message.includes(key)) return CLAIM_ERRORS[key];
  }
  return `No se pudo aceptar la invitación: ${message}`;
}

/**
 * Aceptación de invitación (F9). El invitado pone su email (el de la invitación) +
 * contraseña → `auth.signUp` (anon, crea auth.users) → `rpc('claim_invite')` (la
 * función SECURITY DEFINER valida token + email y crea su fila public.users) →
 * reload a /dashboard (el middleware enruta por rol). Si ya tiene cuenta, intenta
 * iniciar sesión y canjear igualmente.
 */
export function AcceptInviteForm({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      toast.error('Email no válido.');
      return;
    }
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();

      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });

      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          const { error: e2 } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
          if (e2) {
            toast.error('Ya existe una cuenta con ese email. Inicia sesión con tu contraseña en /login.');
            return;
          }
        } else {
          toast.error(`No se pudo crear la cuenta: ${error.message}`);
          return;
        }
      } else if (!data.session) {
        // Confirmación de email activada → no hay sesión inmediata (variante diferida).
        toast.message('Revisa tu email para confirmar la cuenta y vuelve a abrir el enlace.');
        return;
      }

      // Sesión activa → canjear el token (claim_invite crea la fila public.users).
      const { error: claimErr } = await supabase.rpc('claim_invite', { p_token: token });
      if (claimErr) {
        toast.error(mapClaimError(claimErr.message));
        return;
      }

      toast.success('¡Bienvenido! Entrando…');
      window.location.href = '/dashboard';
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Crea tu acceso con el email al que te invitaron y una contraseña.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="inv-email">Email</Label>
        <Input
          id="inv-email"
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
        <Label htmlFor="inv-password">Contraseña</Label>
        <Input
          id="inv-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="inv-confirm">Repite la contraseña</Label>
        <Input
          id="inv-confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={isPending}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Aceptando…' : 'Aceptar invitación'}
      </Button>
    </form>
  );
}
