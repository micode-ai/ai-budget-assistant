import { createHash } from 'crypto';
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_TEXT_CHARS } from './config';
import type { Sniffed } from './sniff';

export interface Candidate {
  sniffed: Sniffed;
  filename?: string;
  content: Buffer;
}

export interface PickedDocument {
  kind: 'pdf' | 'image' | 'text';
  mimeType: string;
  filename?: string;
  base64?: string;
  text?: string;
  contentHash: string;
}

const RECEIPT_NAME = /paragon|receipt|rachunek|faktura|invoice|order|zam[oó]wienie|potwierdzenie/i;

/** Same rule as the API's receiptFingerprint (ABA-603): SHA-256 of the base64 TEXT. */
export function fingerprintBase64(base64: string): string {
  return createHash('sha256').update(base64.replace(/\s/g, '')).digest('hex');
}

export function normaliseText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function hashText(text: string): string {
  return createHash('sha256').update(normaliseText(text)).digest('hex');
}

function withinCap(c: Candidate): boolean {
  return c.content.length <= (c.sniffed.kind === 'pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES);
}

/**
 * ONE document per message (MVP). Priority: a PDF whose name looks like a receipt, else the
 * first PDF, then the first image, then the text body. Over-cap files are skipped (the
 * caller counts them as ignored).
 */
export function pickDocument(candidates: Candidate[], bodyText: string | null): PickedDocument | null {
  const usable = candidates.filter(withinCap);
  const pdfs = usable.filter((c) => c.sniffed.kind === 'pdf');
  const chosen =
    pdfs.find((c) => c.filename && RECEIPT_NAME.test(c.filename)) ?? pdfs[0] ?? usable.find((c) => c.sniffed.kind === 'image');
  if (chosen) {
    const base64 = chosen.content.toString('base64');
    return {
      kind: chosen.sniffed.kind,
      mimeType: chosen.sniffed.mimeType,
      ...(chosen.filename ? { filename: chosen.filename.slice(0, 255) } : {}),
      base64,
      contentHash: fingerprintBase64(base64),
    };
  }
  const text = bodyText ? normaliseText(bodyText).slice(0, MAX_TEXT_CHARS) : '';
  if (!text) return null;
  return { kind: 'text', mimeType: 'text/plain', text, contentHash: hashText(text) };
}
