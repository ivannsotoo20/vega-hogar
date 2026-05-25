// @vega-hogar/db — cliente Supabase compartido + tipos generados Prisma.
// Fase 0: stubs. El schema y los helpers de query se construyen en Fase 1.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type VegaHogarSupabase = SupabaseClient;

export interface CreateSupabaseClientParams {
  url: string;
  key: string;
}

export function createSupabaseClient(params: CreateSupabaseClientParams): VegaHogarSupabase {
  return createClient(params.url, params.key, {
    auth: { persistSession: false },
  });
}
