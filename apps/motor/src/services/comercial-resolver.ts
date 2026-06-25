import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { logger } from '../lib/logger.js';

/**
 * Resuelve el `comercial_user_id` para una visita/handoff (round-robin por
 * oficina, balanceado por carga de visitas programadas).
 *
 * Prioridad:
 *  1. `preferredUserId` (p.ej. `properties.assigned_to_user_id` o
 *     `leads.assigned_to_user_id`) si es un usuario activo y elegible.
 *  2. Usuarios activos de la oficina (`user_office_assignments`) con rol elegible,
 *     escogiendo el que menos visitas `scheduled` tenga (load-balancing).
 *  3. Fallback: cualquier usuario activo elegible del tenant.
 */

const ELIGIBLE_ROLES: Database['public']['Enums']['user_role'][] = [
  'comercial',
  'asistente_captador',
  'director_oficina',
];

export interface ResolveComercialParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  officeId?: number | null;
  preferredUserId?: number | null;
}

export async function resolveComercial(
  params: ResolveComercialParams,
): Promise<number | null> {
  const { supabase, tenantId, officeId, preferredUserId } = params;

  // 1. preferredUserId si es válido (activo + rol elegible + tenant).
  if (preferredUserId) {
    const { data } = await supabase
      .from('users')
      .select('id, active, role')
      .eq('id', preferredUserId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (data && data.active && ELIGIBLE_ROLES.includes(data.role)) {
      return Number(data.id);
    }
  }

  // 2. Candidatos de la oficina.
  let candidateIds: number[] = [];
  if (officeId) {
    const { data: assignments } = await supabase
      .from('user_office_assignments')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('office_id', officeId);
    candidateIds = (assignments ?? []).map((a) => Number(a.user_id));
  }

  let candidates = await filterEligibleUsers(supabase, tenantId, candidateIds);

  // 3. Fallback: cualquier elegible del tenant.
  if (candidates.length === 0) {
    candidates = await filterEligibleUsers(supabase, tenantId, null);
  }
  if (candidates.length === 0) {
    logger.warn({ tenantId, officeId }, '[comercial-resolver] sin comercial elegible');
    return null;
  }

  // Load-balancing: el candidato con menos visitas `scheduled`.
  const { data: visitRows } = await supabase
    .from('visits')
    .select('comercial_user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'scheduled')
    .in('comercial_user_id', candidates);
  const load = new Map<number, number>(candidates.map((id) => [id, 0]));
  for (const v of visitRows ?? []) {
    const uid = Number(v.comercial_user_id);
    load.set(uid, (load.get(uid) ?? 0) + 1);
  }
  // Orden estable: menos carga primero, desempate por id ascendente.
  candidates.sort((a, b) => (load.get(a)! - load.get(b)!) || a - b);
  return candidates[0]!;
}

async function filterEligibleUsers(
  supabase: SupabaseClient<Database>,
  tenantId: number,
  restrictToIds: number[] | null,
): Promise<number[]> {
  if (restrictToIds !== null && restrictToIds.length === 0) return [];
  let q = supabase
    .from('users')
    .select('id, role, active')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .in('role', ELIGIBLE_ROLES);
  if (restrictToIds !== null) q = q.in('id', restrictToIds);
  const { data, error } = await q;
  if (error) {
    logger.warn({ err: error.message }, '[comercial-resolver] filterEligibleUsers failed');
    return [];
  }
  return (data ?? []).map((u) => Number(u.id));
}
