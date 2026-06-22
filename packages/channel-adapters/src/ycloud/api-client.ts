/**
 * Cliente HTTP para la API pública de YCloud (subset que usa el motor Vega).
 *
 * Endpoint principal: POST {base}/v2/whatsapp/messages/sendDirectly
 * Auth: header `X-API-Key: <api_key>`.
 *
 * YCloud es BSP oficial Meta y expone WhatsApp Cloud API estándar. Solo soporta
 * WhatsApp. El destinatario se identifica por phone en formato E.164 (con o sin '+').
 */

export interface YCloudSendTextParams {
  apiKey: string;
  /** Número del business en E.164 (ej '+34611223344'). */
  from: string;
  /** Destinatario en E.164 — wa_id (con o sin '+'). */
  to: string;
  /** Texto a enviar (≤4096 chars según WhatsApp). */
  text: string;
  /** Override de la URL base. Default `https://api.ycloud.com`. */
  baseUrl?: string;
  /** Override de fetch (para tests). */
  fetchImpl?: typeof fetch;
}

export interface YCloudSendTextResult {
  /** ID que YCloud asigna al mensaje (wamid o id propio). */
  providerMessageId: string;
  /** Status devuelto por YCloud (típicamente 'accepted'). */
  status: string;
  /** Body crudo (debug). */
  raw: unknown;
}

export class YCloudApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'YCloudApiError';
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_BASE_URL = 'https://api.ycloud.com';

export async function ycloudSendText(
  params: YCloudSendTextParams,
): Promise<YCloudSendTextResult> {
  const {
    apiKey,
    from,
    to,
    text,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = fetch,
  } = params;

  if (!apiKey) throw new Error('ycloudSendText: apiKey requerida');
  if (!from) throw new Error('ycloudSendText: from requerido');
  if (!to) throw new Error('ycloudSendText: to requerido');
  if (!text || text.trim().length === 0) throw new Error('ycloudSendText: text vacío');

  const url = `${baseUrl.replace(/\/$/, '')}/v2/whatsapp/messages/sendDirectly`;
  const body = {
    from: normalizePhone(from),
    to: normalizePhone(to),
    type: 'text',
    text: { body: text },
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
    throw new YCloudApiError(
      `YCloud sendDirectly failed: HTTP ${response.status}`,
      response.status,
      parsed,
    );
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const status = typeof obj.status === 'string' ? obj.status : 'accepted';
  // YCloud responde con id del mensaje en `id` o `wamid` según contrato observado.
  const providerMessageId =
    (typeof obj.wamid === 'string' && obj.wamid) ||
    (typeof obj.id === 'string' && obj.id) ||
    `ycloud-${Date.now()}`;

  return { providerMessageId, status, raw: parsed };
}

/** Quita espacios y guiones; mantiene el '+' inicial si existe. */
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '').trim();
}
