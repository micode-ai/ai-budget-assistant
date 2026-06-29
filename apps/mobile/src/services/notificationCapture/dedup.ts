/**
 * Dedup key helper for notification auto-capture.
 * Produces a 16-character hex string from SHA-256 of the input string,
 * matching the spec §2a formula: `notif:<sha256(key).slice(0,16)>`.
 *
 * Uses the existing platform-resolved crypto module (crypto.native.ts on Android,
 * crypto.web.ts on web) — avoids reimplementing SHA-256 and respects the
 * established crypto abstraction layer.
 */
import { sha256, fromUtf8 } from '@/services/crypto';

/**
 * Returns the first 16 hex characters of SHA-256(input).
 * Matches the spec formula: `notif:<sha256(packageName|amount|merchant|isoDate)>.slice(0,16)`.
 */
export async function sha256SimpleHex(input: string): Promise<string> {
  const bytes = await sha256(fromUtf8(input));
  // Convert Uint8Array to hex string
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
