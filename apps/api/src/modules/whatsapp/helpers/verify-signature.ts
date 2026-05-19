import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the X-Hub-Signature-256 header on an inbound WhatsApp webhook.
 * Returns false for any malformed input — never throws.
 */
export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const actualHex = signatureHeader.slice('sha256='.length);

  if (expected.length !== actualHex.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actualHex, 'hex'));
  } catch {
    return false;
  }
}
