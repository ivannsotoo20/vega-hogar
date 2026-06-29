import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de firma del webhook de Cal.com (seguridad dura, CLAUDE.md §10).
 *
 * Cal.com firma el body con `x-cal-signature-256: HMAC_SHA256(rawBody, secret)` en hex.
 * Funciones puras (no I/O, no env). `timingSafeEqual` para evitar timing oracle.
 * El caller decide qué hacer según `*_WEBHOOK_VERIFY_MODE` (disabled|warn|enforce).
 */

export type CalcomVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_secret' | 'missing_signature' | 'signature_mismatch' };

export interface VerifyCalcomOptions {
  rawBody: Buffer | string;
  /** Header `x-cal-signature-256`. */
  signatureHeader: string | undefined;
  secret: string;
}

export function verifyCalcomSignature(opts: VerifyCalcomOptions): CalcomVerifyResult {
  if (!opts.secret || opts.secret.length === 0) return { ok: false, reason: 'invalid_secret' };
  const sig = opts.signatureHeader?.trim().toLowerCase();
  if (!sig || !/^[0-9a-f]+$/.test(sig)) return { ok: false, reason: 'missing_signature' };

  const bodyBuf = Buffer.isBuffer(opts.rawBody) ? opts.rawBody : Buffer.from(opts.rawBody, 'utf8');
  const expected = createHmac('sha256', opts.secret).update(bodyBuf).digest('hex');
  if (expected.length !== sig.length) return { ok: false, reason: 'signature_mismatch' };
  if (!timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sig, 'utf8'))) {
    return { ok: false, reason: 'signature_mismatch' };
  }
  return { ok: true };
}

/** Helper sólo para tests: genera un header `x-cal-signature-256` válido. */
export function buildCalcomSignatureHeader(rawBody: Buffer | string, secret: string): string {
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  return createHmac('sha256', secret).update(bodyBuf).digest('hex');
}
