'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { setAgencyAdmin } from '@/lib/actions/members';

export interface AdminRow {
  id: number;
  fullName: string | null;
  email: string;
  role: string;
  isAgencyAdmin: boolean;
}

const ERROR_LABELS: Record<string, string> = {
  cannot_demote_self: 'No puedes quitarte el flag a ti mismo.',
  last_agency_admin: 'Debe quedar al menos un agency-admin.',
  FORBIDDEN_ROLE_REQUIRED: 'Solo un admin puede cambiar esto.',
};

export function AdminsClient({ rows, viewerId }: { rows: AdminRow[]; viewerId: number }) {
  const [state, setState] = useState(rows);
  const [isPending, startTransition] = useTransition();

  function onToggle(userId: number, next: boolean) {
    const current = state.find((r) => r.id === userId)?.isAgencyAdmin ?? false;
    // Optimistic.
    setState((prev) => prev.map((r) => (r.id === userId ? { ...r, isAgencyAdmin: next } : r)));

    startTransition(async () => {
      const res = await setAgencyAdmin({ userId, isAgencyAdmin: next });
      if (!res.ok) {
        // Revert.
        setState((prev) => prev.map((r) => (r.id === userId ? { ...r, isAgencyAdmin: current } : r)));
        toast.error(ERROR_LABELS[res.error] ?? `No se pudo actualizar: ${res.error}`);
      } else {
        toast.success(`Agency-admin ${next ? 'concedido' : 'revocado'}`);
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 text-left">
            <th className="p-3 font-medium">Miembro</th>
            <th className="p-3 font-medium">Rol</th>
            <th className="p-3 text-center font-medium">Agency-admin</th>
          </tr>
        </thead>
        <tbody>
          {state.map((r) => {
            const isSelf = r.id === viewerId;
            return (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{r.fullName ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </td>
                <td className="p-3">
                  <Badge variant="outline" className="font-mono text-xs">{r.role}</Badge>
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Switch
                      checked={r.isAgencyAdmin}
                      disabled={isPending}
                      onCheckedChange={(v) => onToggle(r.id, v)}
                      aria-label={`Agency-admin para ${r.fullName ?? r.email}`}
                    />
                    {isSelf ? <span className="text-xs text-muted-foreground">(tú)</span> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
