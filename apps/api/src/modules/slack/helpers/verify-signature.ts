import { createHmac, timingSafeEqual } from 'crypto';

const MAX_SKEW_SECONDS = 60 * 5;

/**
 * Verifies a Slack request signature.
 * Slack signs `v0:{timestamp}:{rawBody}` with HMAC-SHA256 keyed by the app's
 * signing secret, hex-encoded and prefixed `v0=`. Header: X-Slack-Signature,
 * timestamp header: X-Slack-Request-Timestamp. Requests older than 5 minutes
 * are rejected (replay protection). Never throws.
 */
export function verifySlackSignature(
  rawBody: Buffer,
  timestamp: string | undefined,
  signatureHeader: string | undefined,
  signingSecret: string,
): boolean {
  if (!timestamp || !signatureHeader || !signatureHeader.startsWith('v0=')) {
    return false;
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_SECONDS) return false;

  const base = `v0:${timestamp}:${rawBody.toString('utf8')}`;
  const expectedHex = createHmac('sha256', signingSecret).update(base).digest('hex');
  const actualHex = signatureHeader.slice('v0='.length);

  if (expectedHex.length !== actualHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'));
  } catch {
    return false;
  }
}
