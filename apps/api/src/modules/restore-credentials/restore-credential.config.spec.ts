import {
  fingerprintHexToApkKeyHash,
  apkKeyHashOrigin,
  resolveRestoreCredentialConfig,
} from './restore-credential.config';

// A real Play/debug fingerprint is 32 bytes printed as colon-separated hex.
const FINGERPRINT =
  'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:' +
  'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';
const FLAT = FINGERPRINT.replace(/:/g, '');

describe('fingerprintHexToApkKeyHash', () => {
  // Asserted by round-trip rather than against a copied constant: the property
  // that matters is "the same 32 bytes, re-encoded", and a hand-copied base64
  // string would only prove someone pasted it correctly once.
  it('re-encodes the same bytes as unpadded base64url', () => {
    const hash = fingerprintHexToApkKeyHash(FINGERPRINT);
    expect(Buffer.from(hash, 'base64url').toString('hex').toUpperCase()).toBe(FLAT);
  });

  it('produces url-safe output with no padding', () => {
    const hash = fingerprintHexToApkKeyHash(FINGERPRINT);
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('accepts lowercase and already-flat input', () => {
    expect(fingerprintHexToApkKeyHash(FLAT.toLowerCase())).toBe(
      fingerprintHexToApkKeyHash(FINGERPRINT),
    );
  });

  it('rejects anything that is not a 32-byte hex fingerprint', () => {
    expect(() => fingerprintHexToApkKeyHash('AB:CD')).toThrow(/SHA-256/);
    expect(() => fingerprintHexToApkKeyHash(`${FLAT}00`)).toThrow(/SHA-256/);
    expect(() => fingerprintHexToApkKeyHash(FLAT.replace('A', 'Z'))).toThrow(/SHA-256/);
  });
});

describe('apkKeyHashOrigin', () => {
  it('prefixes the android origin scheme', () => {
    expect(apkKeyHashOrigin(FINGERPRINT)).toBe(
      `android:apk-key-hash:${fingerprintHexToApkKeyHash(FINGERPRINT)}`,
    );
  });
});

describe('resolveRestoreCredentialConfig', () => {
  it('defaults the rp id to the apex domain', () => {
    const cfg = resolveRestoreCredentialConfig({
      RESTORE_CREDENTIAL_CERT_FINGERPRINTS: FINGERPRINT,
    } as NodeJS.ProcessEnv);
    expect(cfg.rpId).toBe('ai-budget.pl');
  });

  it('turns every configured fingerprint into an expected origin', () => {
    const second = FLAT.replace(/^AB/, 'CD');
    const cfg = resolveRestoreCredentialConfig({
      RESTORE_CREDENTIAL_CERT_FINGERPRINTS: ` ${FINGERPRINT} , ${second} `,
    } as NodeJS.ProcessEnv);
    expect(cfg.expectedOrigins).toEqual([
      apkKeyHashOrigin(FINGERPRINT),
      apkKeyHashOrigin(second),
    ]);
  });

  // Failing closed matters: an empty origin list would make verification
  // accept nothing, but a silently-empty one looks like a crypto bug for a day.
  it('throws when no fingerprint is configured', () => {
    expect(() => resolveRestoreCredentialConfig({} as NodeJS.ProcessEnv)).toThrow(
      /RESTORE_CREDENTIAL_CERT_FINGERPRINTS/,
    );
  });
});
