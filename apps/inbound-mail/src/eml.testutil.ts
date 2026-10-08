import type { AuthSummary } from './policy';

export const EML_DATE = 'Thu, 08 Oct 2026 10:00:00 +0000';
export const EML_DATE_MS = Date.parse(EML_DATE);

export const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 0x41), Buffer.from('\n%%EOF')]);
export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(6000, 0x01),
]);
export const SMALL_PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(100, 0x01),
]);
export const ZIP_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(300, 0x02)]);
export const EXE_BYTES = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 0x03)]);

export const PASSING_AUTH: AuthSummary = {
  spf: 'pass',
  dkim: [{ domain: 'shop.example', result: 'pass' }],
  dmarc: { result: 'pass', policy: 'reject' },
  arc: { result: 'none', sealer: null },
};

export interface Att {
  filename: string;
  contentType: string;
  content: Buffer;
  inlineCid?: string;
}

export interface EmlOptions {
  from?: string;
  to?: string;
  subject?: string;
  /** Raw Date header value. */
  date?: string;
  /** Extra raw header lines, e.g. a second From. */
  extraHeaders?: string[];
  messageId?: string | null;
  text?: string;
  html?: string;
  attachments?: Att[];
}

function wrap64(b: Buffer): string {
  return (b.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
}

/** Hand-built RFC 822 message: no outbound library, only strings. */
export function buildEml(o: EmlOptions = {}): Buffer {
  const b = 'BOUNDARY-1';
  const lines: string[] = [
    `From: ${o.from ?? 'Shop <orders@shop.example>'}`,
    `To: ${o.to ?? 'abcdefghijklmnop@in.ai-budget.pl'}`,
    `Subject: ${o.subject ?? 'Your receipt'}`,
    `Date: ${o.date ?? EML_DATE}`,
    ...(o.extraHeaders ?? []),
  ];
  if (o.messageId !== null) lines.push(`Message-ID: ${o.messageId ?? '<msg-1@shop.example>'}`);
  lines.push('MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${b}"`, '');
  const body = o.html
    ? ['Content-Type: text/html; charset=utf-8', '', o.html]
    : ['Content-Type: text/plain; charset=utf-8', '', o.text ?? ''];
  lines.push(`--${b}`, ...body);
  for (const a of o.attachments ?? []) {
    lines.push(
      `--${b}`,
      `Content-Type: ${a.contentType}; name="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      a.inlineCid
        ? `Content-Disposition: inline; filename="${a.filename}"`
        : `Content-Disposition: attachment; filename="${a.filename}"`,
      ...(a.inlineCid ? [`Content-ID: <${a.inlineCid}>`] : []),
      '',
      wrap64(a.content),
    );
  }
  lines.push(`--${b}--`, '');
  return Buffer.from(lines.join('\r\n'), 'utf8');
}
