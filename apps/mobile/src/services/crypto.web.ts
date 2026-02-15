// Web crypto implementation using tweetnacl (NaCl secretbox)
// Uses nacl.secretbox (XSalsa20-Poly1305) for symmetric encryption — matches crypto.native.ts
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

import { ENCRYPTION_CONFIG } from '@budget/shared-utils';

// --- Encode/decode helpers ---

export const toBase64: (data: Uint8Array) => string = naclUtil.encodeBase64;
export const fromBase64: (str: string) => Uint8Array = naclUtil.decodeBase64;
export const toUtf8: (data: Uint8Array) => string = naclUtil.encodeUTF8;
export const fromUtf8: (str: string) => Uint8Array = naclUtil.decodeUTF8;

// --- Random bytes ---

export function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

// --- Pure JS SHA-256 (used for PBKDF2 fallback when crypto.subtle unavailable) ---

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Sync(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const padLen = (64 - ((data.length + 9) % 64)) % 64;
  const padded = new Uint8Array(data.length + 1 + padLen + 8);
  padded.set(data, 0);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (((w[i-15] >>> 7) | (w[i-15] << 25)) ^ ((w[i-15] >>> 18) | (w[i-15] << 14)) ^ (w[i-15] >>> 3)) >>> 0;
      const s1 = (((w[i-2] >>> 17) | (w[i-2] << 15)) ^ ((w[i-2] >>> 19) | (w[i-2] << 13)) ^ (w[i-2] >>> 10)) >>> 0;
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false); outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false); outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false); outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false); outView.setUint32(28, h7, false);
  return out;
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return sha256Sync(data);
}

// --- HMAC-SHA256 / PBKDF2 (pure JS, synchronous — used as fallback) ---

function hmacSha256Sync(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  let keyBytes = key;
  if (keyBytes.length > blockSize) {
    keyBytes = sha256Sync(keyBytes);
  }

  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(keyBytes, 0);

  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = paddedKey[i] ^ 0x36;
    opad[i] = paddedKey[i] ^ 0x5c;
  }

  const innerInput = new Uint8Array(blockSize + message.length);
  innerInput.set(ipad, 0);
  innerInput.set(message, blockSize);
  const innerHash = sha256Sync(innerInput);

  const outerInput = new Uint8Array(blockSize + 32);
  outerInput.set(opad, 0);
  outerInput.set(innerHash, blockSize);
  return sha256Sync(outerInput);
}

function pbkdf2Sync(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLengthBytes: number,
): Uint8Array {
  const hashLen = 32;
  const numBlocks = Math.ceil(keyLengthBytes / hashLen);
  const result = new Uint8Array(numBlocks * hashLen);

  for (let i = 1; i <= numBlocks; i++) {
    const blockInput = new Uint8Array(salt.length + 4);
    blockInput.set(salt, 0);
    blockInput[salt.length] = (i >>> 24) & 0xff;
    blockInput[salt.length + 1] = (i >>> 16) & 0xff;
    blockInput[salt.length + 2] = (i >>> 8) & 0xff;
    blockInput[salt.length + 3] = i & 0xff;

    let u = hmacSha256Sync(password, blockInput);
    const block = new Uint8Array(u);

    for (let j = 1; j < iterations; j++) {
      u = hmacSha256Sync(password, u);
      for (let k = 0; k < hashLen; k++) {
        block[k] ^= u[k];
      }
    }

    result.set(block, (i - 1) * hashLen);
  }

  return result.slice(0, keyLengthBytes);
}

// --- Key derivation (PBKDF2) ---

export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  // Yield to the UI thread so loading spinners can render before blocking
  await new Promise((resolve) => setTimeout(resolve, 50));
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  // Try native crypto.subtle PBKDF2 first (faster)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const buf = (data: Uint8Array): BufferSource => data as unknown as BufferSource;
      const baseKey = await crypto.subtle.importKey('raw', buf(passphraseBytes), 'PBKDF2', false, [
        'deriveBits',
      ]);

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: buf(salt),
          iterations: ENCRYPTION_CONFIG.pbkdf2Iterations,
          hash: 'SHA-256',
        },
        baseKey,
        ENCRYPTION_CONFIG.aesKeyLengthBits,
      );

      return new Uint8Array(derivedBits);
    } catch {
      // PBKDF2 not supported — fall through to manual implementation
    }
  }

  try {
    return pbkdf2Sync(
      passphraseBytes,
      salt,
      ENCRYPTION_CONFIG.pbkdf2Iterations,
      ENCRYPTION_CONFIG.aesKeyLengthBits / 8,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Key derivation failed: ${msg}`);
  }
}

// --- Symmetric encryption (NaCl secretbox: XSalsa20-Poly1305) ---
// Named encryptAesGcm/decryptAesGcm for API compatibility with crypto.native.ts

const NONCE_LENGTH = nacl.secretbox.nonceLength; // 24

export async function encryptAesGcm(
  plaintext: Uint8Array,
  key: Uint8Array,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array }> {
  const nonce = getRandomBytes(NONCE_LENGTH);
  const box = nacl.secretbox(plaintext, nonce, key);
  if (!box) throw new Error('Encryption failed');

  // nacl.secretbox output: [16-byte Poly1305 tag | ciphertext]
  const tag = box.slice(0, nacl.secretbox.overheadLength);
  const ciphertext = box.slice(nacl.secretbox.overheadLength);

  return { iv: nonce, ciphertext, tag };
}

export async function decryptAesGcm(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  tag: Uint8Array,
): Promise<Uint8Array> {
  // Reconstruct nacl.secretbox format: [tag | ciphertext]
  const box = new Uint8Array(tag.length + ciphertext.length);
  box.set(tag, 0);
  box.set(ciphertext, tag.length);

  const result = nacl.secretbox.open(box, iv, key);
  if (!result) throw new Error('Decryption failed');
  return result;
}

// --- Convenience: encrypt string field ---

export async function encryptField(
  plaintext: string,
  accountKey: Uint8Array,
): Promise<{ iv: string; ct: string; tag: string }> {
  const plaintextBytes = fromUtf8(plaintext);
  const { iv, ciphertext, tag } = await encryptAesGcm(plaintextBytes, accountKey);
  return {
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
    tag: toBase64(tag),
  };
}

// --- Convenience: decrypt string field ---

export async function decryptField(
  encrypted: { iv: string; ct: string; tag: string },
  accountKey: Uint8Array,
): Promise<string> {
  const iv = fromBase64(encrypted.iv);
  const ciphertext = fromBase64(encrypted.ct);
  const tag = fromBase64(encrypted.tag);
  const decrypted = await decryptAesGcm(ciphertext, accountKey, iv, tag);
  return toUtf8(decrypted);
}

// --- X25519 key pair generation ---

export function generateX25519KeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  const keyPair = nacl.box.keyPair();
  return { publicKey: keyPair.publicKey, secretKey: keyPair.secretKey };
}

// --- Ed25519 key pair generation ---

export function generateEd25519KeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  const keyPair = nacl.sign.keyPair();
  return { publicKey: keyPair.publicKey, secretKey: keyPair.secretKey };
}

// --- ECDH shared secret ---

export function computeSharedSecret(
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  return nacl.box.before(theirPublicKey, mySecretKey);
}

// --- Wrap key with another key ---

export async function wrapKey(keyToWrap: Uint8Array, wrappingKey: Uint8Array): Promise<string> {
  const { iv, ciphertext, tag } = await encryptAesGcm(keyToWrap, wrappingKey);
  const combined = new Uint8Array(iv.length + ciphertext.length + tag.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  combined.set(tag, iv.length + ciphertext.length);
  return toBase64(combined);
}

// --- Unwrap key ---

export async function unwrapKey(wrapped: string, wrappingKey: Uint8Array): Promise<Uint8Array> {
  const combined = fromBase64(wrapped);
  const nonceLength = NONCE_LENGTH;
  const tagLength = nacl.secretbox.overheadLength; // 16

  if (combined.length < nonceLength + tagLength) {
    throw new Error('Invalid wrapped key data');
  }

  const iv = combined.slice(0, nonceLength);
  const ciphertext = combined.slice(nonceLength, combined.length - tagLength);
  const tag = combined.slice(combined.length - tagLength);
  return decryptAesGcm(ciphertext, wrappingKey, iv, tag);
}

// --- Generate recovery key as human-readable string ---

export function generateRecoveryKey(): { key: Uint8Array; display: string } {
  const key = getRandomBytes(ENCRYPTION_CONFIG.recoveryKeyLengthBytes);
  const hex = Array.from(key)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const display = hex
    .toUpperCase()
    .match(/.{1,4}/g)!
    .slice(0, 8)
    .join('-');
  return { key, display };
}
