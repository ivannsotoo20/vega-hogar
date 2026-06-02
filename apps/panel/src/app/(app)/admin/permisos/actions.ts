'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/auth/types';

const VALID_ROLES: UserRole[] = [
  'admin',
  'director_general',
  'director_oficina',
  'comercial',
  'asistente_captador',
];

interface ToggleResult {
  ok: boolean;
  error?: string;
}

/**
 * Cambia el flag `granted` de una fila concreta de permissions_matrix.
 * Defense in depth: re-valida rol admin server-side aunque la page también
 * lo hace, y RLS también lo enforcea.
 *
 * No audit log en Fase 2 — diferido (requeriría service role en motor).
 */
export async function togglePermissionAction(formData: FormData): Promise<ToggleResult> {
  const profile = await requireRole('admin');

  const role = String(formData.get('role') ?? '') as UserRole;
  const permissionKey = String(formData.get('permission_key') ?? '');
  const grantedRaw = String(formData.get('granted') ?? '');
  const granted = grantedRaw === 'true';

  if (!VALID_ROLES.includes(role)) {
    return { ok: false, error: 'Rol no válido' };
  }
  if (!permissionKey || permissionKey.length > 80) {
    return { ok: false, error: 'permission_key no válido' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('permissions_matrix')
    .upsert(
      {
        tenant_id: profile.tenantId,
        role,
        permission_key: permissionKey,
        granted,
      },
      { onConflict: 'tenant_id,role,permission_key' },
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/permisos');
  return { ok: true };
}
