/**
 * Crypto round-trip tests.
 * Run with: npx jest apps/mobile/src/services/__tests__/crypto.test.ts
 */

// Use the web implementation for testing (works in Node.js with webcrypto)
import { webcrypto } from 'crypto';

// Polyfill globalThis.crypto for Node
if (!globalThis.crypto) {
  // @ts-ignore - polyfill for test environment
  globalThis.crypto = webcrypto;
}

// Mock tweetnacl-util since it may not resolve in test env
jest.mock('tweetnacl-util', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  encodeBase64(data: any) { return Buffer.from(data).toString('base64'); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decodeBase64(str: any) { return new Uint8Array(Buffer.from(str, 'base64')); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  encodeUTF8(data: any) { return Buffer.from(data).toString('utf8'); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decodeUTF8(str: any) { return new Uint8Array(Buffer.from(str, 'utf8')); },
}));

jest.mock('@budget/shared-utils', () => ({
  ENCRYPTION_CONFIG: {
    pbkdf2Iterations: 100, // Reduced for test speed (manual PBKDF2 is slower)
    aesKeyLengthBits: 256,
    ivLengthBytes: 12,
    saltLengthBytes: 32,
    recoveryKeyLengthBytes: 32,
    encryptionFormatVersion: 1,
  },
}));

import {
  deriveKeyFromPassphrase,
  encryptAesGcm,
  decryptAesGcm,
  encryptField,
  decryptField,
  generateX25519KeyPair,
  computeSharedSecret,
  wrapKey,
  unwrapKey,
  generateRecoveryKey,
  getRandomBytes,
  toBase64,
  fromBase64,
  sha256,
} from '../crypto.web';

describe('SHA-256 correctness', () => {
  test('SHA-256 of empty string matches known value', async () => {
    const hash = await sha256(new Uint8Array(0));
    const hex = Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('SHA-256 of "abc" matches known value', async () => {
    const hash = await sha256(new TextEncoder().encode('abc'));
    const hex = Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('PBKDF2 output matches crypto.subtle', async () => {
    const passphrase = 'test-passphrase';
    const salt = new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32]);

    // Our implementation
    const ourKey = await deriveKeyFromPassphrase(passphrase, salt);

    // crypto.subtle reference
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    const refBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100, hash: 'SHA-256' },
      baseKey,
      256,
    );
    const refKey = new Uint8Array(refBits);

    expect(toBase64(ourKey)).toBe(toBase64(refKey));
  });
});

describe('Crypto primitives', () => {
  test('PBKDF2 key derivation produces 32-byte key', async () => {
    const salt = getRandomBytes(32);
    const key = await deriveKeyFromPassphrase('test-passphrase', salt);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  test('Same passphrase + salt produces same key', async () => {
    const salt = getRandomBytes(32);
    const key1 = await deriveKeyFromPassphrase('my-passphrase', salt);
    const key2 = await deriveKeyFromPassphrase('my-passphrase', salt);
    expect(toBase64(key1)).toBe(toBase64(key2));
  });

  test('Different passphrase produces different key', async () => {
    const salt = getRandomBytes(32);
    const key1 = await deriveKeyFromPassphrase('passphrase-1', salt);
    const key2 = await deriveKeyFromPassphrase('passphrase-2', salt);
    expect(toBase64(key1)).not.toBe(toBase64(key2));
  });

  test('AES-GCM encrypt/decrypt round-trip', async () => {
    const key = getRandomBytes(32);
    const plaintext = new TextEncoder().encode('Hello, E2EE!');

    const { iv, ciphertext, tag } = await encryptAesGcm(plaintext, key);
    expect(ciphertext.length).toBeGreaterThan(0);
    expect(iv.length).toBe(24); // NaCl secretbox nonce
    expect(tag.length).toBe(16);

    const decrypted = await decryptAesGcm(ciphertext, key, iv, tag);
    expect(new TextDecoder().decode(decrypted)).toBe('Hello, E2EE!');
  });

  test('Decryption with wrong key fails', async () => {
    const key1 = getRandomBytes(32);
    const key2 = getRandomBytes(32);
    const plaintext = new TextEncoder().encode('Secret');

    const { iv, ciphertext, tag } = await encryptAesGcm(plaintext, key1);

    await expect(decryptAesGcm(ciphertext, key2, iv, tag)).rejects.toThrow('Decryption failed');
  });

  test('encryptField/decryptField round-trip for strings', async () => {
    const key = getRandomBytes(32);
    const original = 'Grocery shopping at Walmart';

    const encrypted = await encryptField(original, key);
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.ct).toBeTruthy();
    expect(encrypted.tag).toBeTruthy();

    const decrypted = await decryptField(encrypted, key);
    expect(decrypted).toBe(original);
  });

  test('encryptField handles unicode strings', async () => {
    const key = getRandomBytes(32);
    const original = 'Покупка продуктов 🛒 в магазине';

    const encrypted = await encryptField(original, key);
    const decrypted = await decryptField(encrypted, key);
    expect(decrypted).toBe(original);
  });

  test('encryptField handles empty string', async () => {
    const key = getRandomBytes(32);
    const encrypted = await encryptField('', key);
    const decrypted = await decryptField(encrypted, key);
    expect(decrypted).toBe('');
  });
});

describe('Key wrapping', () => {
  test('wrapKey/unwrapKey round-trip', async () => {
    const keyToWrap = getRandomBytes(32);
    const wrappingKey = getRandomBytes(32);

    const wrapped = await wrapKey(keyToWrap, wrappingKey);
    expect(typeof wrapped).toBe('string');

    const unwrapped = await unwrapKey(wrapped, wrappingKey);
    expect(toBase64(unwrapped)).toBe(toBase64(keyToWrap));
  });

  test('unwrapKey with wrong key fails', async () => {
    const keyToWrap = getRandomBytes(32);
    const wrappingKey1 = getRandomBytes(32);
    const wrappingKey2 = getRandomBytes(32);

    const wrapped = await wrapKey(keyToWrap, wrappingKey1);
    await expect(unwrapKey(wrapped, wrappingKey2)).rejects.toThrow();
  });
});

describe('X25519 key exchange', () => {
  test('ECDH shared secret is symmetric', () => {
    const alice = generateX25519KeyPair();
    const bob = generateX25519KeyPair();

    const sharedAlice = computeSharedSecret(alice.secretKey, bob.publicKey);
    const sharedBob = computeSharedSecret(bob.secretKey, alice.publicKey);

    expect(toBase64(sharedAlice)).toBe(toBase64(sharedBob));
  });

  test('Different key pairs produce different shared secrets', () => {
    const alice = generateX25519KeyPair();
    const bob = generateX25519KeyPair();
    const charlie = generateX25519KeyPair();

    const sharedAB = computeSharedSecret(alice.secretKey, bob.publicKey);
    const sharedAC = computeSharedSecret(alice.secretKey, charlie.publicKey);

    expect(toBase64(sharedAB)).not.toBe(toBase64(sharedAC));
  });
});

describe('Recovery key', () => {
  test('generates key in correct format', () => {
    const { key, display } = generateRecoveryKey();
    expect(key.length).toBe(32);
    expect(display).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){7}$/);
  });

  test('recovery key can wrap/unwrap master key', async () => {
    const masterKey = getRandomBytes(32);
    const { key: recoveryKey } = generateRecoveryKey();

    const wrapped = await wrapKey(masterKey, recoveryKey);
    const unwrapped = await unwrapKey(wrapped, recoveryKey);

    expect(toBase64(unwrapped)).toBe(toBase64(masterKey));
  });
});

describe('Full E2EE flow simulation', () => {
  test('setup → encrypt → decrypt with derived key', async () => {
    // 1. User sets passphrase
    const passphrase = 'my-secure-passphrase-123';
    const salt = getRandomBytes(32);

    // 2. Derive master key
    const masterKey = await deriveKeyFromPassphrase(passphrase, salt);

    // 3. Generate account key
    const accountKey = getRandomBytes(32);

    // 4. Wrap account key with master key
    const wrappedAK = await wrapKey(accountKey, masterKey);

    // 5. Encrypt expense description
    const description = 'Lunch at Subway';
    const encryptedDesc = await encryptField(description, accountKey);

    // 6. Simulate "lock" — lose in-memory keys
    // 7. Simulate "unlock" — re-derive master key from passphrase
    const recoveredMK = await deriveKeyFromPassphrase(passphrase, salt);
    const recoveredAK = await unwrapKey(wrappedAK, recoveredMK);

    // 8. Decrypt
    const decryptedDesc = await decryptField(encryptedDesc, recoveredAK);
    expect(decryptedDesc).toBe(description);
  });

  test('shared account key exchange via ECDH', async () => {
    // Owner generates account key
    const accountKey = getRandomBytes(32);

    // Both generate X25519 key pairs
    const owner = generateX25519KeyPair();
    const member = generateX25519KeyPair();

    // Owner wraps AK for member using ECDH shared secret
    const sharedSecret = computeSharedSecret(owner.secretKey, member.publicKey);
    const wrappedForMember = await wrapKey(accountKey, sharedSecret);

    // Member unwraps using reverse ECDH
    const memberShared = computeSharedSecret(member.secretKey, owner.publicKey);
    const memberAK = await unwrapKey(wrappedForMember, memberShared);

    // Both can encrypt/decrypt the same data
    const encrypted = await encryptField('Shared expense', accountKey);
    const decrypted = await decryptField(encrypted, memberAK);
    expect(decrypted).toBe('Shared expense');
  });
});
