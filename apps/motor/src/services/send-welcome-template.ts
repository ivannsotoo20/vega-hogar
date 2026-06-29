import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { ycloudSendTemplate } from '@vega-hogar/channel-adapters';
import { decryptWithDefault } from '../lib/crypto.js';
import { env } from '../config/env.js';

/**
 * Envía la plantilla de bienvenida WhatsApp vía YCloud (re-domain de SETTER, solo
 * YCloud — sin GHL). Persiste el mensaje (`role='agent'`) y marca la conversación
 * como outbound de bienvenida (fase 1, IA activa). CODEADO + gated: el trigger
 * (campaña / alta de lead) y el go-live (cuenta YCloud + plantilla Meta aprobada)
 * son posteriores a F10.
 */

export interface SendWelcomeTemplateParams {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  leadId: number;
  conversationId: number;
  templateId: number;
  fetchImpl?: typeof fetch;
}

export interface SendWelcomeTemplateResult {
  providerMessageId: string;
  status: string;
  templateName: string;
  bodyText: string;
}

export async function sendWelcomeTemplate(
  params: SendWelcomeTemplateParams,
): Promise<SendWelcomeTemplateResult> {
  const { supabase, tenantId, leadId, conversationId, templateId, fetchImpl } = params;

  // 1. Plantilla.
  const { data: tpl, error: tplErr } = await supabase
    .from('followup_templates')
    .select('id, name, provider, provider_template_id, language, body')
    .eq('id', templateId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (tplErr || !tpl) throw new Error(`sendWelcomeTemplate: plantilla ${templateId} no encontrada`);
  if (tpl.provider !== 'ycloud') throw new Error(`sendWelcomeTemplate: provider no soportado: ${tpl.provider}`);

  // 2. Lead.
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, phone, full_name')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (leadErr || !lead) throw new Error(`sendWelcomeTemplate: lead ${leadId} no encontrado`);
  if (!lead.phone) throw new Error('sendWelcomeTemplate: lead sin phone');

  // 3. Credenciales YCloud.
  const { data: ia } = await supabase
    .from('integration_accounts')
    .select('credentials_encrypted')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ycloud')
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  const apiKey = decryptApiKey(ia?.credentials_encrypted);
  if (!apiKey) throw new Error('sendWelcomeTemplate: sin credenciales YCloud activas');
  const businessPhone = env.YCLOUD_BUSINESS_PHONE;
  if (!businessPhone) throw new Error('sendWelcomeTemplate: YCLOUD_BUSINESS_PHONE no configurado');

  // 4. Variables del cuerpo (simple: {{1}} = nombre del lead).
  const firstName = (lead.full_name as string | null)?.trim().split(/\s+/)[0] ?? '';
  const bodyVariables = firstName ? [firstName] : [];
  const bodyText = renderBody((tpl.body as string | null) ?? '', bodyVariables);

  // 5. Enviar.
  const result = await ycloudSendTemplate({
    apiKey,
    from: businessPhone,
    to: lead.phone as string,
    templateName: (tpl.provider_template_id as string | null) ?? (tpl.name as string),
    language: (tpl.language as string | null) ?? 'es',
    bodyVariables,
    baseUrl: env.YCLOUD_API_BASE,
    fetchImpl,
  });

  // 6. Persistir + marcar conversación.
  await supabase.from('conversation_messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    role: 'agent',
    content: bodyText,
    content_type: 'text',
    external_msg_id: result.providerMessageId,
  });
  await supabase
    .from('conversations')
    .update({
      direction: 'outbound',
      conversation_source: 'bienvenida',
      current_phase: 1,
      ai_paused_until: null,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);

  return {
    providerMessageId: result.providerMessageId,
    status: result.status,
    templateName: (tpl.provider_template_id as string | null) ?? (tpl.name as string),
    bodyText,
  };
}

function decryptApiKey(creds: unknown): string | null {
  try {
    const blob =
      typeof creds === 'string'
        ? creds
        : creds && typeof creds === 'object'
          ? ((creds as Record<string, unknown>).api_key ?? (creds as Record<string, unknown>).apiKey)
          : null;
    return typeof blob === 'string' && blob.length > 0 ? decryptWithDefault(blob) : null;
  } catch {
    return null;
  }
}

/** Sustituye {{1}}, {{2}}, … por las variables (1-indexed). */
function renderBody(body: string, vars: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] ?? '');
}
