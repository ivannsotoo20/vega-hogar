import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { env } from '../config/env.js';

/**
 * Cliente Supabase **service-role** del motor (bypassa RLS), tipado con `Database`
 * (tipos generados en S5) para cazar bugs de nombre de columna en compile-time.
 *
 * ⚠ REGLA 2 (no-negociable): `SUPABASE_SERVICE_ROLE_KEY` vive SOLO en el motor.
 * Este módulo NUNCA debe importarse desde `apps/panel` (que usa anon + RLS). El
 * aislamiento lo garantiza la arquitectura (apps separadas; el panel no depende
 * de `@vega-hogar/motor`) y la ausencia de la service-role key en el bundle del panel.
 */
export type MotorSupabase = SupabaseClient<Database>;

let client: MotorSupabase | null = null;

export function getSupabase(): MotorSupabase {
  if (!client) {
    client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'public' },
    });
  }
  return client;
}
