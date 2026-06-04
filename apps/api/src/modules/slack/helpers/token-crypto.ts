import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

/** Parse the 32-byte key from a hex (64 chars) or base64 string. Throws if not 32 bytes. */
function parseKey(key: string): Buffer {
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(key)) buf = Buffer.from(key, 'hex');
  else buf = Buffer.from(key, 'base64');
  if (buf.length !== 32) {
    throw new Error('SLACK_TOKEN_ENC_KEY must be 32 bytes (64 hex chars or base64)');
  }
  return buf;
}

/** Encrypt a token: returns base64(iv):base64(authTag):base64(ciphertext). */
export function encryptToken(plain: string, key: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, parseKey(key), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** Decrypt; returns '' on any malformed/tampered input or wrong key (never throws). */
export function decryptToken(enc: string, key: string): string {
  try {
    const [ivB64, tagB64, dataB64] = enc.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const decipher = createDecipheriv(ALGO, parseKey(key), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}
