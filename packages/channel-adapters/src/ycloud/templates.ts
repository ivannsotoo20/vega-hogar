/**
 * YCloud Templates API — list + send template messages.
 *
 * Endpoints (YCloud public API, BSP oficial Meta):
 *   - GET  {base}/v2/whatsapp/templates?wabaId=<id>   → lista templates aprobadas.
 *   - POST {base}/v2/whatsapp/messages/sendDirectly con type='template'
 *           → envía mensaje template (única opción legal pasadas las 24h).
 *
 * Sin estos endpoints, Meta bloquea el número WA por enviar texto libre fuera de
 * la ventana 24h. En Vega lo usa el welcome-template (S19) y el sync del panel.
 */

export interface YCloudTemplateRow {
  /** Nombre interno único en la WABA. */
  name: string;
  /** Idioma BCP-47 (ej. 'es', 'en_US'). */
  language: string;
  /** MARKETING | UTILITY | AUTHENTICATION. */
  category: string;
  /** Estado en Meta. Solo APPROVED puede enviarse. */
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED' | string;
  /**
   * Componentes (HEADER/BODY/FOOTER/BUTTONS) según API Meta. Cada uno con `text`
   * y opcional `example.body_text` (placeholders {{1}}, {{2}}).
   */
  components?: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | string;
    text?: string;
    example?: { body_text?: string[][] };
    buttons?: Array<Record<string, unknown>>;
  }>;
  /** Cualquier metadata extra que devuelva YCloud. */
  [key: string]: unknown;
}

export interface YCloudListTemplatesParams {
  apiKey: string;
  /** WABA id (Meta WhatsApp Business Account). Configurado en YCloud. */
  wabaId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.ycloud.com';

export class YCloudTemplatesError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'YCloudTemplatesError';
    this.status = status;
    this.body = body;
  }
}

export async function ycloudListTemplates(
  params: YCloudListTemplatesParams,
): Promise<YCloudTemplateRow[]> {
  const { apiKey, wabaId, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch } = params;
  if (!apiKey) throw new Error('ycloudListTemplates: apiKey requerida');
  if (!wabaId) throw new Error('ycloudListTemplates: wabaId requerida');

  // YCloud rechaza limit > 100 con 400 PARAM_INVALID. Para MVP basta con 100.
  const url = `${baseUrl.replace(/\/$/, '')}/v2/whatsapp/templates?wabaId=${encodeURIComponent(wabaId)}&limit=100`;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new YCloudTemplatesError(
      `YCloud listTemplates failed: HTTP ${response.status}`,
      response.status,
      parsed,
    );
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  // YCloud responde {offset, limit, length, items: [...]}. Fallbacks a list/data
  // por defensa pero el shape real verificado usa `items`.
  const list = Array.isArray(obj.items)
    ? obj.items
    : Array.isArray(obj.list)
      ? obj.list
      : Array.isArray(obj.data)
        ? obj.data
        : [];
  return list.filter((it) => typeof it === 'object' && it != null) as YCloudTemplateRow[];
}

// ----------------------------------------------------------------------------
// Send Template Message
// ----------------------------------------------------------------------------

export interface YCloudSendTemplateParams {
  apiKey: string;
  /** Número del business en E.164 (ej '+34611223344'). */
  from: string;
  /** Destinatario en E.164 — wa_id (con o sin '+'). */
  to: string;
  /** Nombre de la template aprobada en YCloud. */
  templateName: string;
  /** Idioma de la template (ej 'es', 'en_US'). */
  language: string;
  /**
   * Variables del cuerpo en orden ({{1}}, {{2}}, …). Solo se rellena el componente
   * BODY — header/buttons no soportados en este wrapper inicial.
   */
  bodyVariables?: string[];
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface YCloudSendTemplateResult {
  providerMessageId: string;
  status: string;
  raw: unknown;
}

export async function ycloudSendTemplate(
  params: YCloudSendTemplateParams,
): Promise<YCloudSendTemplateResult> {
  const {
    apiKey,
    from,
    to,
    templateName,
    language,
    bodyVariables = [],
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = fetch,
  } = params;

  if (!apiKey) throw new Error('ycloudSendTemplate: apiKey requerida');
  if (!from) throw new Error('ycloudSendTemplate: from requerido');
  if (!to) throw new Error('ycloudSendTemplate: to requerido');
  if (!templateName) throw new Error('ycloudSendTemplate: templateName requerido');
  if (!language) throw new Error('ycloudSendTemplate: language requerido');

  const components =
    bodyVariables.length > 0
      ? [
          {
            type: 'body',
            parameters: bodyVariables.map((v) => ({ type: 'text', text: v })),
          },
        ]
      : undefined;

  const url = `${baseUrl.replace(/\/$/, '')}/v2/whatsapp/messages/sendDirectly`;
  const body = {
    from: normalizePhone(from),
    to: normalizePhone(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      ...(components ? { components } : {}),
    },
  };

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new YCloudTemplatesError(
      `YCloud sendTemplate failed: HTTP ${response.status}`,
      response.status,
      parsed,
    );
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const status = typeof obj.status === 'string' ? obj.status : 'accepted';
  const providerMessageId =
    (typeof obj.wamid === 'string' && obj.wamid) ||
    (typeof obj.id === 'string' && obj.id) ||
    `ycloud-tpl-${Date.now()}`;
  return { providerMessageId, status, raw: parsed };
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '').trim();
}

// ----------------------------------------------------------------------------
// Helpers para extraer body text + variables
// ----------------------------------------------------------------------------

export function extractTemplateBody(template: YCloudTemplateRow): string | null {
  const body = (template.components ?? []).find((c) => c.type === 'BODY' || c.type === 'body');
  return body?.text ?? null;
}

export function extractTemplateVariables(
  template: YCloudTemplateRow,
): Array<{ name: string; sample: string | null }> {
  const body = extractTemplateBody(template);
  if (!body) return [];
  // Soporta {{1}} numéricas y {{nombre}} named (Meta v15+).
  const matches = body.match(/\{\{([^{}]+)\}\}/g) ?? [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of matches) {
    const name = m.replace(/[{}]/g, '').trim();
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  const samples =
    template.components?.find((c) => c.type === 'BODY' || c.type === 'body')?.example?.body_text?.[0] ?? [];
  return ordered.map((name, idx) => ({
    name,
    sample: samples[idx] ?? null,
  }));
}
