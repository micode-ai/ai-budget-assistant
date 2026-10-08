import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Server-signed scan attestation (ABA-642 D1). Pure: no I/O, no clock reads
 * (callers pass `now`), no Prisma.
 *
 * The token proves "the server's own OCR read these lines on this receipt for
 * this user, recently". It is `base64url(json) + "." + base64url(HMAC(k_att, json))`
 * with `k_att = HMAC(COMMUNITY_PRICE_SALT, "cp-scan-attest-v1")` — domain-separated
 * from the contributor hash, no new env var. It holds only the caller's own data,
 * so it is signed but not encrypted, and it is never stored.
 *
 * WHAT IT PROVES (and does not): "OUR OCR read this document for this user". It does
 * NOT prove the document is a genuine receipt — a forged image or a hand-made PDF is
 * read just as well. That is why only PIXELS may earn one (a camera/gallery image, or
 * a PDF with no text layer that we rasterise); plain text and text-layer PDFs are
 * whatever their author typed and are NEVER attested, on any route. Genuineness is
 * defended by the other layers (k-anonymity, trusted contributors, persistence,
 * behavioural clustering), not by this token.
 */

/** A salt shorter than this is a weak HMAC key: attestation is disabled, not weakened. */
export const MIN_SALT_LENGTH = 32;

/** The usable salt, or null when it is unset or too short to key an HMAC safely. */
export function usableCommunitySalt(raw: string | undefined | null): string | null {
  return typeof raw === 'string' && raw.length >= MIN_SALT_LENGTH ? raw : null;
}

export const SCAN_ATTESTATION_VERSION = 1;
/** A token is accepted for this long after it was issued. */
export const SCAN_ATTESTATION_TTL_MS = 24 * 60 * 60 * 1000;
/** Hard cap on attested lines, to keep the token (and the DTO's MaxLength) bounded. */
export const SCAN_ATTESTATION_MAX_LINES = 100;
/** Canonical names beyond this are not real product names (matches the corpus cap). */
export const ATTESTED_NAME_MAX_LEN = 64;

export interface ScanAttestationPayload {
  v: 1;
  /** userId the token was issued to. */
  u: string;
  /** accountId it was issued in. */
  a: string;
  /** Issued-at, epoch ms. */
  iat: number;
  /** Normalized merchant (as the corpus stores it). */
  m: string;
  /** Currency code. */
  c: string;
  /** Receipt date, YYYY-MM-DD. */
  d: string;
  /** Receipt time or null. */
  t: string | null;
  /** Receipt total in cents. */
  tot: number;
  /** Server-geocoded store point, rounded to 4 dp. */
  loc: [number, number];
  /** One 16-hex hash per attested line. */
  h: string[];
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function attestKey(salt: string): Buffer {
  return createHmac('sha256', salt).update('cp-scan-attest-v1').digest();
}

/**
 * Quantity as INTEGER THOUSANDTHS — exactly the precision of the DB column
 * (Decimal(10,3)), so the OCR side (a float) and the saved row (a Decimal) quantise
 * identically and no float rounding can make the two disagree. A missing, non-positive
 * or sub-thousandth quantity means 1 unit, on both sides.
 */
export function quantityMilli(quantity: unknown): number {
  const q = Number(quantity);
  const m = Number.isFinite(q) && q > 0 ? Math.round(q * 1000) : 0;
  return m >= 1 ? m : 1000;
}

/** Line total as integer cents. */
export function totalCents(totalPrice: unknown): number {
  return Math.round(Number(totalPrice) * 100);
}

/**
 * Unit price in whole cents-of-a-cent-free decimal, derived ONLY from the attested
 * integers (cents, thousandths) — never from a client-editable unit price.
 */
export function attestedUnitPrice(quantity: unknown, totalPrice: unknown): number {
  return Math.round((totalCents(totalPrice) * 1000) / quantityMilli(quantity)) / 100;
}

/** Hash of one line: sha256(canonicalName|quantityMilli|totalCents), first 16 hex chars. */
export function attestedLineHash(canonicalName: string, quantity: number, totalPrice: number): string {
  return createHash('sha256')
    .update(`${canonicalName}|${quantityMilli(quantity)}|${totalCents(totalPrice)}`)
    .digest('hex')
    .slice(0, 16);
}

export function signScanAttestation(salt: string, payload: ScanAttestationPayload): string {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = createHmac('sha256', attestKey(salt)).update(json).digest();
  return `${b64url(json)}.${b64url(sig)}`;
}

/**
 * Verify signature, shape, binding (`u` AND `a`) and the 24 h window. Returns the
 * payload, or null for anything wrong — a caller never learns WHICH check failed.
 */
export function verifyScanAttestation(
  salt: string,
  token: string | undefined | null,
  expected: { userId: string; accountId: string; now: Date },
): ScanAttestationPayload | null {
  if (!salt || !token || typeof token !== 'string' || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  let json: Buffer;
  let sig: Buffer;
  try {
    json = Buffer.from(parts[0], 'base64url');
    sig = Buffer.from(parts[1], 'base64url');
  } catch {
    return null;
  }
  const want = createHmac('sha256', attestKey(salt)).update(json).digest();
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;

  let p: ScanAttestationPayload;
  try {
    p = JSON.parse(json.toString('utf8'));
  } catch {
    return null;
  }
  if (!p || p.v !== SCAN_ATTESTATION_VERSION) return null;
  if (p.u !== expected.userId || p.a !== expected.accountId) return null;
  if (typeof p.iat !== 'number') return null;
  const age = expected.now.getTime() - p.iat;
  if (age < 0 || age > SCAN_ATTESTATION_TTL_MS) return null;
  if (
    typeof p.m !== 'string' ||
    typeof p.c !== 'string' ||
    typeof p.d !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.d) ||
    typeof p.tot !== 'number' ||
    !Array.isArray(p.loc) ||
    p.loc.length !== 2 ||
    !p.loc.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    !Array.isArray(p.h) ||
    p.h.length === 0 ||
    p.h.length > SCAN_ATTESTATION_MAX_LINES ||
    !p.h.every((h) => typeof h === 'string' && /^[0-9a-f]{16}$/.test(h))
  ) {
    return null;
  }
  return p;
}

/**
 * D4 content key: HMAC(k_att, m|d|t|tot|lineCount). Identifies the physical receipt
 * irrespective of who scanned it; carries no user/account link. Deliberately a STABLE
 * subset — NOT the line hashes: two OCR reads of one paper receipt routinely differ in
 * a line's name or quantity, which would give two keys and let the same receipt count
 * twice.
 */
export function receiptContentKey(salt: string, p: ScanAttestationPayload): string {
  const body = [p.m, p.d, p.t ?? '', String(p.tot), String(p.h.length)].join('|');
  return createHmac('sha256', attestKey(salt)).update(body).digest('hex');
}
