import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { decryptWithDefault } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';

/**
 * Resuelve la config Cal.com de un tenant para las tools (slots/booking): el
 * `eventTypeId` (de `calendar_accounts` por defecto/activo) + la `apiKey` descifrada
 * (de `integration_accounts` provider='cal_com'). Devuelve null si no está
 * configurado → el caller cae a mock. Gated (solo se invoca con CALENDAR_PROVIDER=calcom).
 */
export interface CalcomConfig {
  eventTypeId: number;
  apiKey: string;
  baseUrl?: string;
  calendarAccountId: number;
  integrationAccountId: number;
}

export async function resolveCalcomConfig(
  supabase: SupabaseClient<Database>,
  tenantId: number,
): Promise<CalcomConfig | null> {
  const { data: cal } = await supabase
    .from('calendar_accounts')
    .select('id, external_calendar_id, integration_account_id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!cal) return null;
  const eventTypeId = Number(cal.external_calendar_id);
  if (!Number.isFinite(eventTypeId)) {
    logger.warn({ tenantId, raw: cal.external_calendar_id }, '[calcom] external_calendar_id no numérico');
    return null;
  }

  const { data: ia } = await supabase
    .from('integration_accounts')
    .select('id, credentials_encrypted, connection_config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'cal_com')
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (!ia) {
    logger.warn({ tenantId }, '[calcom] sin integration_account cal_com activa');
    return null;
  }

  let apiKey: string | null = null;
  try {
    const creds = ia.credentials_encrypted as unknown;
    const blob =
      typeof creds === 'string'
        ? creds
        : creds && typeof creds === 'object'
          ? ((creds as Record<string, unknown>).api_key ?? (creds as Record<string, unknown>).apiKey)
          : null;
    if (typeof blob === 'string' && blob.length > 0) apiKey = decryptWithDefault(blob);
  } catch (err) {
    logger.warn({ tenantId, err: err instanceof Error ? err.message : String(err) }, '[calcom] descifrado de apiKey falló');
  }
  if (!apiKey) return null;

  const cfg = (ia.connection_config ?? {}) as Record<string, unknown>;
  const baseUrl = typeof cfg.base_url === 'string' ? cfg.base_url : undefined;

  return {
    eventTypeId,
    apiKey,
    baseUrl,
    calendarAccountId: Number(cal.id),
    integrationAccountId: Number(ia.id),
  };
}
