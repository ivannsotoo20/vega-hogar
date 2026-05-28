/**
 * Tipos compartidos del módulo auth.
 *
 * UserRole refleja el enum SQL `public.user_role` (Fase 1). Si se añade un
 * valor al enum en BD, actualizar también este tipo y `ROLE_HIERARCHY`.
 */

export type UserRole =
  | 'admin'
  | 'director_general'
  | 'director_oficina'
  | 'comercial'
  | 'asistente_captador';

/**
 * Jerarquía numérica. `requireRole` interpreta `min: UserRole` como
 * "este nivel o superior". Empate `comercial = asistente_captador` por diseño
 * — son roles operativos paralelos sin subordinación entre sí.
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 5,
  director_general: 4,
  director_oficina: 3,
  comercial: 2,
  asistente_captador: 2,
};

/** Fila de `public.users` reducida a lo que el panel necesita en runtime. */
export interface UserProfile {
  id: number;
  authUserId: string;
  tenantId: number;
  email: string;
  fullName: string | null;
  role: UserRole;
  active: boolean;
}
