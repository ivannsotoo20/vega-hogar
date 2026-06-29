// Motor — configuración de entorno (validada con zod, fail-fast).
// El motor SÍ usa SUPABASE_SERVICE_ROLE_KEY (bypassa RLS). Jamás en el panel (regla 2).
// Carga el .env.local de la raíz del monorepo buscando en rutas candidatas (igual que setters_ia).

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, '../../.env.local'), // apps/motor/.env.local
  resolve(here, '../../../../.env.local'), // raíz del monorepo
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '../../.env.local'),
];
// Bajo vitest NO cargamos `.env.local`: los tests son herméticos (las vars vienen
// de `vitest.config.ts` → `test.env`). Evita que valores vacíos del .env.local de
// desarrollo (vars que Iván rellena por fase) pisen los dummies de test.
if (!process.env.VITEST) {
  for (const path of candidates) {
    if (existsSync(path)) {
      loadEnv({ path, override: true });
      break;
    }
  }
}

const verifyMode = z.enum(['disabled', 'warn', 'enforce']);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3010),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // --- Supabase (service-role: SOLO en el motor) ---
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // --- Anthropic (pipeline 3-LLM; los modelos vienen de llm_configs en BD) ---
  ANTHROPIC_API_KEY: z.string().min(1),

  // --- Cache / queue ---
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // --- Cifrado at-rest de credenciales en integration_accounts (AES-256-GCM) ---
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes hex (64 chars)')
    .optional(),

  // --- Canal WhatsApp ---
  //   mock   → escribe en mock_whatsapp_outbox (driver para alumnos / golden path local).
  //   ycloud → BSP oficial Meta (go-live).
  WHATSAPP_PROVIDER: z.enum(['mock', 'ycloud']).default('mock'),
  YCLOUD_API_BASE: z.string().url().default('https://api.ycloud.com'),
  YCLOUD_API_KEY: z.string().optional(),
  //   Número del business en E.164 (from de YCloud). Requerido para go-live ycloud.
  YCLOUD_BUSINESS_PHONE: z.string().optional(),
  //   disabled → no verifica firma · warn → log si falla + continúa · enforce → 401.
  YCLOUD_WEBHOOK_VERIFY_MODE: verifyMode.default('warn'),

  // --- Calendario / agenda (Cal.com; visits = verdad, Cal.com = espejo/disponibilidad) ---
  //   mock   → slots sintéticos + booking escribe solo visits (golden path local).
  //   calcom → API Cal.com (go-live).
  CALENDAR_PROVIDER: z.enum(['mock', 'calcom']).default('mock'),
  CALCOM_API_BASE: z.string().url().default('https://api.cal.com/v2'),
  CALCOM_API_KEY: z.string().optional(),
  CALCOM_WEBHOOK_VERIFY_MODE: verifyMode.default('warn'),

  // --- Endpoint POST /automations/lead-form/:tenant_token ("Vende con nosotros") ---
  LEAD_FORM_VERIFY_MODE: verifyMode.default('warn'),

  // --- Endpoints internos (bearer) panel ↔ motor ---
  INTERNAL_STATS_TOKEN: z.string().min(16).optional(),
  MOTOR_INTERNAL_URL: z.string().url().default('http://localhost:3010'),
  PANEL_PUBLIC_URL: z.string().url().default('https://vega-hogar-panel.vercel.app'),

  // --- Cron del motor (debounce-tick → process-debounced). Gated: OFF por defecto.
  //     Local/golden path lo activa; el go-live del VPS también. ---
  MOTOR_CRON_ENABLED: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),

  // --- Cron de followups automáticos (gated: OFF por defecto; abre canal real) ---
  FOLLOWUP_CRON_ENABLED: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),

  // --- Multimodal inbound (opcional): Groq Whisper para audios de WhatsApp ---
  GROQ_API_KEY: z.string().optional(),
  GROQ_API_BASE: z.string().url().default('https://api.groq.com/openai/v1'),
  GROQ_AUDIO_MODEL: z.string().default('whisper-large-v3-turbo'),

  // --- Notificaciones email al comercial (opcional, Resend) ---
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default('alertas@vegahogar.es'),
  RESEND_FROM_NAME: z.string().default('Vega Hogar'),
  RESEND_API_BASE: z.string().url().default('https://api.resend.com'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('[motor] FATAL: invalid environment variables');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
