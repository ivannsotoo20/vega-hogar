'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { togglePermissionAction } from './actions';
import type { UserRole } from '@/lib/auth/types';

interface PermissionRow {
  role: UserRole;
  permissionKey: string;
  granted: boolean;
}

interface Props {
  initialRows: PermissionRow[];
  roles: UserRole[];
  permissionKeys: string[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  director_general: 'Dir. General',
  director_oficina: 'Dir. Oficina',
  comercial: 'Comercial',
  asistente_captador: 'Asist. Captador',
};

export function PermissionsClient({ initialRows, roles, permissionKeys }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [isPending, startTransition] = useTransition();

  function getCell(role: UserRole, key: string): boolean {
    const row = rows.find((r) => r.role === role && r.permissionKey === key);
    return row?.granted ?? false;
  }

  function onToggle(role: UserRole, key: string, current: boolean) {
    const next = !current;
    // Optimistic update.
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.role === role && r.permissionKey === key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], granted: next };
        return copy;
      }
      return [...prev, { role, permissionKey: key, granted: next }];
    });

    startTransition(async () => {
      const fd = new FormData();
      fd.set('role', role);
      fd.set('permission_key', key);
      fd.set('granted', String(next));

      const result = await togglePermissionAction(fd);
      if (!result.ok) {
        // Revert.
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.role === role && r.permissionKey === key);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], granted: current };
            return copy;
          }
          return prev;
        });
        toast.error(result.error ?? 'Error al guardar');
      } else {
        toast.success(`${key} · ${ROLE_LABELS[role]} → ${next ? 'on' : 'off'}`);
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="p-3 text-left font-medium">Permission key</th>
            {roles.map((r) => (
              <th key={r} className="p-3 text-center font-medium">
                {ROLE_LABELS[r]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissionKeys.map((key) => (
            <tr key={key} className="border-t">
              <td className="p-3 font-mono text-xs">{key}</td>
              {roles.map((role) => {
                const cell = getCell(role, key);
                return (
                  <td key={role} className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={cell}
                      disabled={isPending}
                      onChange={() => onToggle(role, key, cell)}
                      className="size-4 cursor-pointer accent-[var(--color-brand-oliva)]"
                      aria-label={`${key} para ${ROLE_LABELS[role]}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
