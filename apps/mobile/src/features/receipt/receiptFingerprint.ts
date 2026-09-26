import * as Crypto from 'expo-crypto';

/**
 * SHA-256 of the receipt file's base64 text, whitespace removed — the SAME
 * value the API's `receiptFingerprint()` computes over the string it receives
 * (ABA-603). Hash the text, not decoded bytes, or the two sides diverge.
 * Computed on the device so the pre-scan duplicate check never uploads the
 * file twice. `expo-crypto` falls back to Web Crypto on the web build.
 */
export async function computeReceiptFingerprint(base64: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, (base64 ?? '').replace(/\s/g, ''), {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}
