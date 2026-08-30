export interface RestoreCredentialConfig {
  rpId: string;
  rpName: string;
  expectedOrigins: string[];
}

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

/**
 * `assetlinks.json` prints a signing certificate's SHA-256 as colon-separated
 * uppercase hex; the WebAuthn `origin` an Android app reports is base64url of
 * those same 32 raw bytes. Same bytes, two encodings — converting them by hand
 * is the single most likely way to lose a day to "the signature does not
 * verify", so it happens here and nowhere else.
 */
export function fingerprintHexToApkKeyHash(fingerprint: string): string {
  const hex = fingerprint.replace(/:/g, '').trim();
  if (!SHA256_HEX.test(hex)) {
    throw new Error(
      `Expected a 32-byte SHA-256 certificate fingerprint, got "${fingerprint}"`,
    );
  }
  return Buffer.from(hex, 'hex').toString('base64url');
}

export function apkKeyHashOrigin(fingerprint: string): string {
  return `android:apk-key-hash:${fingerprintHexToApkKeyHash(fingerprint)}`;
}

export function resolveRestoreCredentialConfig(
  env: NodeJS.ProcessEnv,
): RestoreCredentialConfig {
  const raw = (env.RESTORE_CREDENTIAL_CERT_FINGERPRINTS || '').trim();
  if (!raw) {
    throw new Error(
      'RESTORE_CREDENTIAL_CERT_FINGERPRINTS is not set; restore credentials ' +
        'cannot verify any Android origin without it',
    );
  }
  const expectedOrigins = raw
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .map(apkKeyHashOrigin);

  return {
    rpId: env.RESTORE_CREDENTIAL_RP_ID || 'ai-budget.pl',
    rpName: env.RESTORE_CREDENTIAL_RP_NAME || 'AI Budget Assistant',
    expectedOrigins,
  };
}
