import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import type { WhatsAppAdapter, WhatsAppProvider } from './interface.js';
import { MockWhatsAppDriver } from './mock.js';
import { YCloudWhatsAppDriver, type YCloudWhatsAppDriverOptions } from './ycloud.js';

export interface WhatsAppFactoryConfig {
  /** Normalmente `env.WHATSAPP_PROVIDER`. */
  provider: WhatsAppProvider;
  /** Requerido para `provider='mock'` (cliente service-role del motor). */
  supabase?: SupabaseClient<Database>;
  /** Requerido para `provider='ycloud'`. */
  ycloud?: YCloudWhatsAppDriverOptions;
}

/**
 * Selecciona el driver de WhatsApp por `WHATSAPP_PROVIDER`. Espejo de la
 * abstracción `CALENDAR_PROVIDER` (mock|calcom). En F10a el default es `mock`
 * (golden path local); `ycloud` queda codeado + gated hasta el go-live.
 */
export function createWhatsAppAdapter(config: WhatsAppFactoryConfig): WhatsAppAdapter {
  switch (config.provider) {
    case 'mock': {
      if (!config.supabase) {
        throw new Error('createWhatsAppAdapter(mock): supabase requerido');
      }
      return new MockWhatsAppDriver({ supabase: config.supabase });
    }
    case 'ycloud': {
      if (!config.ycloud) {
        throw new Error('createWhatsAppAdapter(ycloud): config.ycloud requerido (apiKey + businessPhone)');
      }
      return new YCloudWhatsAppDriver(config.ycloud);
    }
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`createWhatsAppAdapter: provider no soportado: ${String(exhaustive)}`);
    }
  }
}
