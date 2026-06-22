import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // bytes — AES-256
const IV_LENGTH = 12; // bytes — GCM standard
const TAG_LENGTH = 16; // bytes — GCM standard
const VERSION_PREFIX = 'v1';

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

function parseKey(keyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new CryptoError(
      'invalid CREDENTIALS_ENCRYPTION_KEY: expected 32 bytes hex (64 chars [0-9a-f])',
    );
  }
  return Buffer.from(keyHex, 'hex');
}

export function getDefaultKey(): Buffer {
  const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new CryptoError(
      'CREDENTIALS_ENCRYPTION_KEY is not set. Generate with: openssl rand -hex 32',
    );
  }
  return parseKey(keyHex);
}

export function encrypt(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new CryptoError(`encrypt: key must be ${KEY_LENGTH} bytes, got ${key.length}`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION_PREFIX,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join(':');
}

export function decrypt(blob: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new CryptoError(`decrypt: key must be ${KEY_LENGTH} bytes, got ${key.length}`);
  }
  const parts = blob.split(':');
  if (parts.length !== 4) {
    throw new CryptoError(
      `decrypt: malformed blob, expected 4 colon-separated parts, got ${parts.length}`,
    );
  }
  const [version, ivB64, ciphertextB64, tagB64] = parts as [string, string, string, string];
  if (!constantTimeStringEqual(version, VERSION_PREFIX)) {
    throw new CryptoError(`decrypt: unsupported version '${version}', expected '${VERSION_PREFIX}'`);
  }
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_LENGTH) {
    throw new CryptoError(`decrypt: iv must be ${IV_LENGTH} bytes, got ${iv.length}`);
  }
  if (tag.length !== TAG_LENGTH) {
    throw new CryptoError(`decrypt: auth tag must be ${TAG_LENGTH} bytes, got ${tag.length}`);
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    throw new CryptoError(
      `decrypt: authentication failed (tampering or wrong key): ${(err as Error).message}`,
    );
  }
}

export function encryptWithDefault(plaintext: string): string {
  return encrypt(plaintext, getDefaultKey());
}

export function decryptWithDefault(blob: string): string {
  return decrypt(blob, getDefaultKey());
}

/**
 * Valida al boot que CREDENTIALS_ENCRYPTION_KEY existe y tiene el formato
 * correcto. Lanza CryptoError si falla — el motor debe abortar el arranque en
 * ese caso (NO permitir queue webhooks que luego fallan en runtime).
 */
export function assertEncryptionKey(): void {
  const _key = getDefaultKey(); // throws CryptoError si falta o malformada
  // No expongas la key. Solo confirmamos la carga.
  void _key;
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
