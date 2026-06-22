/**
 * Tracking UUID para leads.
 *
 * Genera un slug opaco de 16 chars (base64url) derivado de HMAC-SHA256(leadId + secret).
 * Determinístico: el mismo lead siempre produce el mismo slug.
 * No reversible: dado el slug, no se puede recuperar `leadId` sin el secret.
 *
 * Uso: el motor lo inyecta como `?vega_lead_uuid=<slug>` en URLs de booking
 * (Cal.com). Cuando llega el webhook de booking, el matcher lee el slug de la
 * metadata/custom field y busca en `leads.tracking_uuid`.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const TRACKING_UUID_LENGTH = 16;

/**
 * Determinístico desde leadId. Usa CREDENTIALS_ENCRYPTION_KEY como secret.
 * 16 chars base64url (sin padding) ≈ 96 bits efectivos: colisión-resistente
 * dentro del scope (millones de leads), no reversible sin la key.
 */
export function computeTrackingUuid(leadId: number | string): string {
  if (leadId === null || leadId === undefined) {
    throw new Error('computeTrackingUuid: leadId requerido');
  }
  const secret = env.CREDENTIALS_ENCRYPTION_KEY ?? '';
  if (!secret) {
    throw new Error('computeTrackingUuid: CREDENTIALS_ENCRYPTION_KEY no configurada');
  }
  return createHmac('sha256', secret)
    .update(String(leadId))
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, TRACKING_UUID_LENGTH);
}

/**
 * UUID totalmente aleatorio. Solo se usa si el caller quiere un slug no derivado
 * (p. ej. para backfill rápido sin secret estable). Por defecto, preferir
 * `computeTrackingUuid`.
 */
export function randomTrackingUuid(): string {
  return randomBytes(12)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, TRACKING_UUID_LENGTH);
}
