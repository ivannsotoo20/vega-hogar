// @vega-hogar/db — cliente Prisma + cliente Supabase compartido para panel y motor.
// Fase 1+: el schema Prisma vive en prisma/schema.prisma. Tras `prisma generate`,
// los tipos y el PrismaClient quedan disponibles para los apps.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

export type VegaHogarSupabase = SupabaseClient;

export interface CreateSupabaseClientParams {
  url: string;
  key: string;
}

/**
 * Crea un cliente Supabase con la key dada (anon o service_role).
 * Service_role solo en motor — nunca en panel.
 */
export function createSupabaseClient(params: CreateSupabaseClientParams): VegaHogarSupabase {
  return createClient(params.url, params.key, {
    auth: { persistSession: false },
  });
}

/**
 * Singleton lazy del cliente Prisma. Una sola instancia compartida por proceso.
 * Útil para motor (Node largo) y para scripts (tsx).
 */
let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return prismaInstance;
}
