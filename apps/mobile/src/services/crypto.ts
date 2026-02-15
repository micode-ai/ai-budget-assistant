// TypeScript resolution stub for platform-specific imports.
// At runtime, Metro/Expo resolves to crypto.native.ts or crypto.web.ts based on platform.

export {
  toBase64,
  fromBase64,
  toUtf8,
  fromUtf8,
  getRandomBytes,
  sha256,
  deriveKeyFromPassphrase,
  encryptAesGcm,
  decryptAesGcm,
  encryptField,
  decryptField,
  generateX25519KeyPair,
  generateEd25519KeyPair,
  computeSharedSecret,
  wrapKey,
  unwrapKey,
  generateRecoveryKey,
} from './crypto.web';
