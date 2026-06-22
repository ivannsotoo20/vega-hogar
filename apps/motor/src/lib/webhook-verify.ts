import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * YCloud webhook signature verification (seguridad dura, CLAUDE.md §10).
 *
 * Format esperado del header `YCloud-Signature: t=<unix_seconds>,s=<hmac_sha256_hex>`.
 * Signed payload: `{timestamp}.{rawBody}`.
 * Algoritmo: HMAC-SHA256 hex.
 *
 * Tolerance default: 300 segundos (5 min) para mitigar replay.
 *
 * Docs YCloud: https://docs.ycloud.com/reference/webhook-integration-guide
 *
 * Diseño:
 *   - Funciones puras: no leen env ni hacen I/O.
 *   - Devuelven `{ ok: boolean, reason?: string }` en vez de throw — el caller
 *     decide qué hacer (responder 401, loggear, etc.).
 *   - `timingSafeEqual` para evitar timing oracle.
 */

export interface ParsedYCloudSignature {
  timestamp: number;
  signature: string;
}

export function parseYCloudSignatureHeader(
  header: string | undefined,
): ParsedYCloudSignature | null {
  if (!header || typeof header !== 'string') return null;
  // Format: "t=1620123456,s=abcdef..."  (orden flexible, separador ',')
  const parts = header.split(',').map((p) => p.trim());
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (key === 't') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
      timestamp = n;
    } else if (key === 's') {
      if (!/^[0-9a-fA-F]+$/.test(value) || value.length === 0) return null;
      signature = value.toLowerCase();
    }
  }
  if (timestamp === null || signature === null) return null;
  return { timestamp, signature };
}

export interface VerifyYCloudOptions {
  /** Cuerpo HTTP crudo recibido (Buffer recomendado; string también acepta). */
  rawBody: Buffer | string;
  /** Header `YCloud-Signature` literal. */
  signatureHeader: string | undefined;
  /** Webhook secret obtenido del panel YCloud. */
  secret: string;
  /** Tolerancia anti-replay en segundos. Default 300. */
  toleranceSeconds?: number;
  /** Inyectable para tests (Date.now() en ms). */
  nowMs?: () => number;
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'malformed_header'
        | 'timestamp_too_old'
        | 'timestamp_in_future'
        | 'signature_mismatch'
        | 'invalid_secret';
    };

export function verifyYCloudSignature(opts: VerifyYCloudOptions): VerifyResult {
  if (!opts.secret || typeof opts.secret !== 'string' || opts.secret.length === 0) {
    return { ok: false, reason: 'invalid_secret' };
  }
  const parsed = parseYCloudSignatureHeader(opts.signatureHeader);
  if (!parsed) return { ok: false, reason: 'malformed_header' };

  const tolerance = opts.toleranceSeconds ?? 300;
  const nowSeconds = Math.floor((opts.nowMs ? opts.nowMs() : Date.now()) / 1000);
  const delta = nowSeconds - parsed.timestamp;
  if (delta > tolerance) return { ok: false, reason: 'timestamp_too_old' };
  // Permitimos un poco de skew hacia el futuro (clock drift) — 60s
  if (delta < -60) return { ok: false, reason: 'timestamp_in_future' };

  const bodyStr = Buffer.isBuffer(opts.rawBody) ? opts.rawBody.toString('utf8') : opts.rawBody;
  const signedPayload = `${parsed.timestamp}.${bodyStr}`;
  const expected = createHmac('sha256', opts.secret).update(signedPayload, 'utf8').digest('hex');

  if (expected.length !== parsed.signature.length) {
    return { ok: false, reason: 'signature_mismatch' };
  }
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(parsed.signature, 'utf8');
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'signature_mismatch' };
  return { ok: true };
}

/**
 * Helper sólo para tests / scripts: genera un header válido `YCloud-Signature`.
 * NO se usa en producción.
 */
export function buildYCloudSignatureHeader(args: {
  rawBody: Buffer | string;
  secret: string;
  timestampSeconds?: number;
}): { header: string; timestamp: number } {
  const ts = args.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const bodyStr = Buffer.isBuffer(args.rawBody) ? args.rawBody.toString('utf8') : args.rawBody;
  const signedPayload = `${ts}.${bodyStr}`;
  const sig = createHmac('sha256', args.secret).update(signedPayload, 'utf8').digest('hex');
  return { header: `t=${ts},s=${sig}`, timestamp: ts };
}
