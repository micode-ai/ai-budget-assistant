import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export type TokenPrefix = 'aba_at_' | 'aba_rt_' | 'aba_cs_' | 'aba_ac_';

/** 32 random bytes, base64url, with a type prefix. Never log the result. */
export function generateToken(prefix: TokenPrefix): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

export function generateClientId(): string {
  return `aba_ci_${randomBytes(16).toString('base64url')}`;
}

export function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

/**
 * Constant-time equality of two strings of any content (compared as UTF-8 bytes), not only hex.
 * A length mismatch returns early: lengths here are public (fixed-size hashes), so that leaks nothing.
 */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (typeof verifier !== 'string' || typeof challenge !== 'string') return false;
  if (!VERIFIER_PATTERN.test(verifier)) return false;
  const computed = createHash('sha256').update(verifier).digest('base64url');
  return safeEqual(computed, challenge);
}
