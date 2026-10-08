import { createHash } from 'crypto';
import { MAX_PDF_BYTES } from './config';
import { buildEml, EXE_BYTES, PASSING_AUTH, PDF_BYTES, PNG_BYTES, SMALL_PNG_BYTES, ZIP_BYTES } from './eml.testutil';
import { extractMessage, messageIdHash } from './extract';
import { fingerprintBase64 } from './pickDocument';
import { sniffMagic } from './sniff';

const ctx = { remoteIp: '203.0.113.9', helo: 'mx.shop.example', envelopeFrom: 'orders@shop.example', auth: PASSING_AUTH };

describe('sniffMagic', () => {
  it('requires %PDF- at byte 0 (matches the API)', () => {
    expect(sniffMagic(Buffer.concat([Buffer.from('JUNK'), PDF_BYTES]))).toBeNull();
    expect(sniffMagic(Buffer.concat([Buffer.alloc(100, 0x20), PDF_BYTES]))).toBeNull();
  });

  it('identifies PDF and images by bytes', () => {
    expect(sniffMagic(PDF_BYTES)).toEqual({ kind: 'pdf', mimeType: 'application/pdf' });
    expect(sniffMagic(PNG_BYTES)?.mimeType).toBe('image/png');
    expect(sniffMagic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(20).fill(0)]))?.mimeType).toBe('image/jpeg');
    expect(sniffMagic(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))?.mimeType).toBe('image/webp');
    expect(sniffMagic(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(8)]))?.mimeType).toBe('image/heic');
  });

  it('rejects archives and executables, however they are named', () => {
    expect(sniffMagic(ZIP_BYTES)).toBeNull();
    expect(sniffMagic(EXE_BYTES)).toBeNull();
    expect(sniffMagic(Buffer.from('plain text that is long enough'))).toBeNull();
  });
});

describe('extractMessage: attachment selection', () => {
  it('uses a PDF even when it is declared as image/jpeg (magic bytes win)', async () => {
    const m = await extractMessage(
      buildEml({ text: 'hi', attachments: [{ filename: 'scan.jpg', contentType: 'image/jpeg', content: PDF_BYTES }] }),
      ctx,
    );
    expect(m.document).toMatchObject({ kind: 'pdf', mimeType: 'application/pdf' });
  });

  it('ignores an .exe named .pdf and a zip, and counts them', async () => {
    const m = await extractMessage(
      buildEml({
        text: 'Order total 12,50 PLN',
        attachments: [
          { filename: 'paragon.pdf', contentType: 'application/pdf', content: EXE_BYTES },
          { filename: 'bundle.zip', contentType: 'application/zip', content: ZIP_BYTES },
        ],
      }),
      ctx,
    );
    expect(m.document).toMatchObject({ kind: 'text' });
    expect(m.ignoredAttachmentCount).toBe(2);
  });

  it('prefers the receipt-named PDF, then any PDF, then an image, then the body', async () => {
    const pdf2 = Buffer.concat([PDF_BYTES, Buffer.from('second')]);
    const named = await extractMessage(
      buildEml({
        text: 'x',
        attachments: [
          { filename: 'terms.pdf', contentType: 'application/pdf', content: PDF_BYTES },
          { filename: 'Paragon_123.pdf', contentType: 'application/pdf', content: pdf2 },
        ],
      }),
      ctx,
    );
    expect(named.document?.filename).toBe('Paragon_123.pdf');

    const img = await extractMessage(
      buildEml({ text: 'body', attachments: [{ filename: 'p.png', contentType: 'image/png', content: PNG_BYTES }] }),
      ctx,
    );
    expect(img.document).toMatchObject({ kind: 'image', mimeType: 'image/png' });

    const pdfOverImage = await extractMessage(
      buildEml({
        text: 'body',
        attachments: [
          { filename: 'p.png', contentType: 'image/png', content: PNG_BYTES },
          { filename: 'a.pdf', contentType: 'application/pdf', content: PDF_BYTES },
        ],
      }),
      ctx,
    );
    expect(pdfOverImage.document?.kind).toBe('pdf');
    expect(pdfOverImage.ignoredAttachmentCount).toBe(1);
  });

  it('skips inline logos and tiny pixels instead of picking them as the receipt', async () => {
    const m = await extractMessage(
      buildEml({
        html: '<p>Total 12,50 PLN</p>',
        attachments: [
          { filename: 'logo.png', contentType: 'image/png', content: PNG_BYTES, inlineCid: 'logo1' },
          { filename: 'pixel.png', contentType: 'image/png', content: SMALL_PNG_BYTES },
        ],
      }),
      ctx,
    );
    expect(m.document?.kind).toBe('text');
  });

  it('skips a PDF over the 10 MB cap', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(MAX_PDF_BYTES + 1, 0x41)]);
    const m = await extractMessage(
      buildEml({ text: 'body text', attachments: [{ filename: 'big.pdf', contentType: 'application/pdf', content: big }] }),
      ctx,
    );
    expect(m.document?.kind).toBe('text');
  });

  it('inspects at most 10 attachments', async () => {
    const atts = Array.from({ length: 12 }, (_, i) => ({
      filename: `f${i}.zip`,
      contentType: 'application/zip',
      content: ZIP_BYTES,
    }));
    atts[11] = { filename: 'late.pdf', contentType: 'application/pdf', content: PDF_BYTES };
    const m = await extractMessage(buildEml({ text: 'body', attachments: atts }), ctx);
    expect(m.document?.kind).toBe('text'); // the PDF was the 12th: never inspected
    expect(m.ignoredAttachmentCount).toBe(12);
  });

  it('re-parses one level of message/rfc822 (Outlook forward-as-attachment)', async () => {
    const inner = buildEml({
      text: 'inner',
      attachments: [{ filename: 'r.pdf', contentType: 'application/pdf', content: PDF_BYTES }],
    });
    const m = await extractMessage(
      buildEml({ text: '', attachments: [{ filename: 'fwd.eml', contentType: 'message/rfc822', content: inner }] }),
      ctx,
    );
    expect(m.document?.kind).toBe('pdf');
  });

  it('fingerprints a file the same way as the API (SHA-256 of the base64 text)', async () => {
    const m = await extractMessage(
      buildEml({ text: 'x', attachments: [{ filename: 'a.pdf', contentType: 'application/pdf', content: PDF_BYTES }] }),
      ctx,
    );
    expect(m.document?.base64).toBe(PDF_BYTES.toString('base64'));
    expect(m.document?.contentHash).toBe(fingerprintBase64(PDF_BYTES.toString('base64')));
  });
});

describe('extractMessage: body text', () => {
  it('strips HTML to text and never keeps links or images', async () => {
    const m = await extractMessage(
      buildEml({
        html: '<html><body><h1>Dziekujemy</h1><p>Razem: <b>49,99 PLN</b></p><img src="https://track.example/p.gif"><a href="https://track.example/x">link</a><script>alert(1)</script></body></html>',
      }),
      ctx,
    );
    expect(m.document?.kind).toBe('text');
    expect(m.document?.text).toContain('49,99 PLN');
    expect(m.document?.text).not.toContain('track.example');
    expect(m.document?.text).not.toContain('alert');
    expect(m.document?.text).not.toContain('<');
  });

  it('hashes text after whitespace normalisation', async () => {
    const a = await extractMessage(buildEml({ text: 'Total   12.50\n\nPLN' }), ctx);
    const b = await extractMessage(buildEml({ text: 'Total 12.50 PLN' }), ctx);
    expect(a.document?.contentHash).toBe(b.document?.contentHash);
    expect(a.document?.contentHash).toBe(createHash('sha256').update('Total 12.50 PLN').digest('hex'));
  });

  it('sends no document for an empty message', async () => {
    const m = await extractMessage(buildEml({ text: '   ' }), ctx);
    expect(m.document).toBeUndefined();
    expect(m.kind).toBe('receipt');
  });
});

describe('extractMessage: metadata', () => {
  it('derives messageIdHash from the lowercased Message-ID', async () => {
    const m = await extractMessage(buildEml({ text: 'x', messageId: '<ABC@Shop.Example>' }), ctx);
    expect(m.messageIdHash).toBe(createHash('sha256').update('<abc@shop.example>').digest('hex'));
    expect(m.messageIdHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to from|date|subject|contentHash without a Message-ID', () => {
    const h = messageIdHash(undefined, 'a@b.c', '2026-10-08T10:00:00.000Z', 'S', 'ch');
    expect(h).toBe(createHash('sha256').update('a@b.c|2026-10-08T10:00:00.000Z|S|ch').digest('hex'));
  });

  it('fills the envelope and auth fields for the handoff', async () => {
    const m = await extractMessage(buildEml({ text: 'x' }), ctx);
    expect(m).toMatchObject({
      remoteIp: '203.0.113.9',
      helo: 'mx.shop.example',
      envelopeFrom: 'orders@shop.example',
      fromAddress: 'orders@shop.example',
      subject: 'Your receipt',
      date: '2026-10-08T10:00:00.000Z',
      kind: 'receipt',
      auth: { spf: 'pass', dkim: ['pass:shop.example'], dmarc: 'pass', arc: 'none' },
    });
  });
});

