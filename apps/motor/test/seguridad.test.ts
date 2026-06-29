import { describe, it, expect } from 'vitest';
import { verifyCalcomSignature, buildCalcomSignatureHeader } from '../src/lib/calcom-verify.js';
import { assertHttpsUrl } from '../src/lib/assert-url.js';

describe('verifyCalcomSignature (HMAC x-cal-signature)', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'bk1' } });

  it('acepta una firma válida', () => {
    const sig = buildCalcomSignatureHeader(body, secret);
    expect(verifyCalcomSignature({ rawBody: body, signatureHeader: sig, secret })).toEqual({ ok: true });
  });
  it('rechaza firma incorrecta', () => {
    const res = verifyCalcomSignature({ rawBody: body, signatureHeader: 'a'.repeat(64), secret });
    expect(res).toEqual({ ok: false, reason: 'signature_mismatch' });
  });
  it('rechaza sin firma o sin secreto', () => {
    expect(verifyCalcomSignature({ rawBody: body, signatureHeader: undefined, secret })).toEqual({ ok: false, reason: 'missing_signature' });
    expect(verifyCalcomSignature({ rawBody: body, signatureHeader: 'abc', secret: '' })).toEqual({ ok: false, reason: 'invalid_secret' });
  });
  it('detecta body manipulado', () => {
    const sig = buildCalcomSignatureHeader(body, secret);
    const res = verifyCalcomSignature({ rawBody: body + 'x', signatureHeader: sig, secret });
    expect(res.ok).toBe(false);
  });
});

describe('assertHttpsUrl', () => {
  it('acepta https', () => {
    expect(assertHttpsUrl('https://api.cal.com/v2').protocol).toBe('https:');
  });
  it('rechaza http y URLs inválidas', () => {
    expect(() => assertHttpsUrl('http://insecure.test')).toThrow(/https/);
    expect(() => assertHttpsUrl('no-es-url')).toThrow(/inválida/);
  });
});
