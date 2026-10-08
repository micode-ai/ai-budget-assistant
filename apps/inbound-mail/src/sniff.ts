export type SniffedKind = 'pdf' | 'image';
export interface Sniffed {
  kind: SniffedKind;
  mimeType: string;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/**
 * Identify a document by its leading bytes only. Content-Type and file extension are
 * attacker-controlled and ignored. Anything not on this allow-list (zip, rar, docx, exe...)
 * returns null and is never opened by any parser.
 */
export function sniffMagic(buf: Buffer): Sniffed | null {
  if (buf.length < 12) return null;
  // PDF: %PDF- must be at byte 0, exactly like the API's sniffer (a laxer rule here would
  // forward documents the API then rejects, and let junk-prefixed polyglots through).
  if (buf.toString('latin1', 0, 5) === '%PDF-') return { kind: 'pdf', mimeType: 'application/pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mimeType: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: 'image', mimeType: 'image/png' };
  }
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return { kind: 'image', mimeType: 'image/webp' };
  }
  if (buf.toString('latin1', 4, 8) === 'ftyp' && HEIC_BRANDS.has(buf.toString('latin1', 8, 12))) {
    return { kind: 'image', mimeType: 'image/heic' };
  }
  return null;
}
