import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import type { AvailableProperty } from '@vega-hogar/prompt-composer';
import { logger } from '../../lib/logger.js';

/**
 * `buscar_inmuebles` (tool PRE-pipeline, Opción A / RAG). Lee las preferencias
 * del lead y devuelve el top-N de inmuebles del catálogo que matchean, con relax
 * en cascada (zona exacta → cualquier zona → solo presupuesto+tipo). Ranking
 * determinístico (SQL/JS, NO LLM). Honra el soft-delete (`deleted_at IS NULL`) y
 * solo inmuebles `available`.
 *
 * Devuelve `AvailableProperty[]` (shape del prompt-composer) + los `ids` (para V19).
 */

type PropertyType = Database['public']['Enums']['property_type'];
type PropertyRow = {
  id: number;
  title: string;
  neighborhood: string;
  type: PropertyType;
  price_eur: number | null;
  monthly_rent_eur: number | null;
  rooms: number;
  m2_built: number;
  features: Database['public']['Tables']['properties']['Row']['features'];
};

export interface BuscarInmueblesParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  leadId: number;
  topN?: number;
}

export interface BuscarInmueblesResult {
  properties: AvailableProperty[];
  ids: number[];
}

const EMPTY: BuscarInmueblesResult = { properties: [], ids: [] };

export async function buscarInmuebles(
  params: BuscarInmueblesParams,
): Promise<BuscarInmueblesResult> {
  const { supabase, tenantId, leadId, topN = 6 } = params;

  // 1. Preferencias del lead (la más reciente). Sin preferencias → no se busca.
  const { data: pref, error: prefErr } = await supabase
    .from('lead_preferences')
    .select('type, neighborhoods, price_min_eur, price_max_eur, rooms_min, m2_min, features_required')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prefErr) {
    logger.warn({ err: prefErr.message, leadId }, '[buscar-inmuebles] lead_preferences query failed');
    return EMPTY;
  }
  if (!pref) return EMPTY;

  const type = pref.type;
  const priceCol = type === 'rent' ? 'monthly_rent_eur' : 'price_eur';
  const neighborhoods = Array.isArray(pref.neighborhoods) ? pref.neighborhoods : [];
  const featuresRequired = (pref.features_required ?? null) as Record<string, unknown> | null;

  // Relax en cascada: nivel 0 = todo; 1 = sin features/rooms/m2; 2 = solo zona+presupuesto+tipo;
  // 3 = solo presupuesto+tipo (cualquier zona).
  for (let relax = 0; relax <= 3; relax++) {
    let q = supabase
      .from('properties')
      .select('id, title, neighborhood, type, price_eur, monthly_rent_eur, rooms, m2_built, features')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('status', 'available')
      .eq('type', type);

    if (relax < 3 && neighborhoods.length > 0) q = q.in('neighborhood', neighborhoods);
    if (pref.price_min_eur != null) q = q.gte(priceCol, pref.price_min_eur);
    if (pref.price_max_eur != null) q = q.lte(priceCol, pref.price_max_eur);
    if (relax < 1) {
      if (pref.rooms_min != null) q = q.gte('rooms', pref.rooms_min);
      if (pref.m2_min != null) q = q.gte('m2_built', pref.m2_min);
      if (featuresRequired && Object.keys(featuresRequired).length > 0) {
        q = q.contains('features', featuresRequired);
      }
    }

    q = q.order(priceCol, { ascending: true, nullsFirst: false }).limit(topN);

    const { data, error } = await q;
    if (error) {
      logger.warn({ err: error.message, relax }, '[buscar-inmuebles] properties query failed');
      return EMPTY;
    }
    const rows = (data ?? []) as PropertyRow[];
    if (rows.length === 0) continue; // relajar

    const properties = rows.map((r) => toAvailableProperty(r, relax, neighborhoods));
    return { properties, ids: rows.map((r) => Number(r.id)) };
  }

  return EMPTY;
}

function toAvailableProperty(
  r: PropertyRow,
  relax: number,
  desiredNeighborhoods: string[],
): AvailableProperty {
  const isRent = r.type === 'rent';
  const price = isRent ? r.monthly_rent_eur : r.price_eur;
  const priceLabel =
    price != null
      ? isRent
        ? `${formatEur(price)}/mes`
        : formatEur(price)
      : 'precio a consultar';

  const inDesiredZone = desiredNeighborhoods.length === 0 || desiredNeighborhoods.includes(r.neighborhood);
  const matchReason =
    relax === 0 && inDesiredZone
      ? 'zona y criterios solicitados'
      : relax >= 3
        ? 'dentro de presupuesto (otra zona)'
        : inDesiredZone
          ? 'zona solicitada, criterios flexibilizados'
          : 'zona alternativa dentro de presupuesto';

  return {
    id: Number(r.id),
    title: r.title,
    neighborhood: r.neighborhood,
    priceLabel,
    rooms: Number(r.rooms),
    m2: Number(r.m2_built),
    matchReason,
  };
}

function formatEur(n: number): string {
  return `${new Intl.NumberFormat('es-ES').format(Math.round(n))} €`;
}
