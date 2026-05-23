import * as iconv from 'iconv-lite';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const REPLACEMENT_CHAR = '�';

export type EncodingHint = 'auto' | 'utf-8' | 'windows-1250';

export function decodeCsvBuffer(buf: Buffer, hint: EncodingHint = 'auto'): string {
  if (hint === 'windows-1250') return iconv.decode(buf, 'windows-1250');
  if (hint === 'utf-8') return stripBom(buf.toString('utf-8'));

  if (buf.length >= 3 && buf.slice(0, 3).equals(UTF8_BOM)) {
    return buf.slice(3).toString('utf-8');
  }

  const asUtf8 = buf.toString('utf-8');
  if (!asUtf8.includes(REPLACEMENT_CHAR)) return asUtf8;
  return iconv.decode(buf, 'windows-1250');
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
