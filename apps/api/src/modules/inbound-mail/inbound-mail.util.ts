import { createHash, randomBytes } from 'crypto';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** 80 random bits as 16 lowercase base32 characters (`[a-z2-7]{16}`). */
export function generateInboundToken(): string {
  const bytes = randomBytes(10);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/**
 * The stored dedup identity of a message: (Message-ID hash, content hash). The row is unique on
 * `(userId, messageIdHash)`, so the content hash is folded into that value: a sender who reuses
 * one Message-ID with different bodies can no longer suppress later, different receipts.
 */
export function inboundDedupKey(messageIdHash: string, contentHash?: string | null): string {
  if (!contentHash) return messageIdHash;
  return createHash('sha256').update(`${messageIdHash}:${contentHash}`).digest('hex');
}

export type SniffedKind = { kind: 'pdf' | 'image'; mimeType: string } | null;

/** Identify a file by its magic bytes, never by the declared Content-Type. */
export function sniffDocument(buf: Buffer): SniffedKind {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf', mimeType: 'application/pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mimeType: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: 'image', mimeType: 'image/png' };
  }
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { kind: 'image', mimeType: 'image/webp' };
  }
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return { kind: 'image', mimeType: 'image/heic' };
    }
  }
  return null;
}

/** sha256 over whitespace-collapsed, lowercased text: the dedup identity of a text-only receipt. */
export function textContentHash(text: string): string {
  return createHash('sha256').update(text.replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex');
}

const AMOUNT_NEAR_CURRENCY =
  /(?:\d[\d\s.,]*\d|\d)\s*(?:pln|zł|zl|eur|€|usd|\$|gbp|£|uah|₴|грн)|(?:pln|zł|zl|eur|€|usd|\$|gbp|£|uah|₴|грн)\s*\d/i;

/**
 * "Not a receipt" pre-filter for a text-only message (no AI): a receipt names a
 * money amount next to a currency. Keeps a careless "forward everything" rule
 * from burning the AI quota.
 */
export function looksLikeReceiptText(text: string): boolean {
  return AMOUNT_NEAR_CURRENCY.test(text);
}

export function senderDomain(fromAddress: string): string {
  const at = fromAddress.lastIndexOf('@');
  const domain = (at >= 0 ? fromAddress.slice(at + 1) : '').toLowerCase().replace(/[^a-z0-9.-]/g, '');
  return domain.slice(0, 100) || 'unknown';
}

/** First 8 hex of sha256(token): the only form of a token that may appear in a log line. */
export function tokenLogId(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}
