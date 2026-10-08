import {
  generateInboundToken,
  looksLikeReceiptText,
  senderDomain,
  sniffDocument,
  textContentHash,
  tokenLogId,
} from './inbound-mail.util';
import { INBOUND_PUSH_LANGUAGES, inboundMailPush } from './inbound-mail-push';

describe('generateInboundToken', () => {
  it('is 16 chars of [a-z2-7] and does not repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = generateInboundToken();
      expect(t).toMatch(/^[a-z2-7]{16}$/);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });
});

describe('sniffDocument (magic bytes, never Content-Type)', () => {
  const pad = (head: Buffer) => Buffer.concat([head, Buffer.alloc(32)]);

  it('identifies PDF, JPEG, PNG, WebP and HEIC', () => {
    expect(sniffDocument(pad(Buffer.from('%PDF-1.4')))).toEqual({ kind: 'pdf', mimeType: 'application/pdf' });
    expect(sniffDocument(pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])))?.mimeType).toBe('image/jpeg');
    expect(sniffDocument(pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))?.mimeType).toBe('image/png');
    expect(sniffDocument(pad(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])))?.mimeType).toBe('image/webp');
    expect(sniffDocument(pad(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic')])))?.mimeType).toBe('image/heic');
  });

  it('rejects executables, archives, HTML and short buffers', () => {
    expect(sniffDocument(pad(Buffer.from('MZ')))).toBeNull();
    expect(sniffDocument(pad(Buffer.from('PK\u0003\u0004')))).toBeNull();
    expect(sniffDocument(pad(Buffer.from('<html>')))).toBeNull();
    expect(sniffDocument(Buffer.from('%PDF-'))).toBeNull();
  });
});

describe('looksLikeReceiptText (not-a-receipt pre-filter)', () => {
  it.each(['Razem 12,50 zł', 'Total: 12.50 PLN', 'Suma 1 299,00 PLN', 'Paid €19.99', 'Order total $5', 'Amount: £4.20', 'Do zapłaty PLN 99'])(
    'passes %p',
    (text) => expect(looksLikeReceiptText(text)).toBe(true),
  );

  it.each(['Your newsletter is here', 'Hello, 3 new offers for you', 'Meeting at 10:30', 'Order 12345 shipped'])(
    'blocks %p',
    (text) => expect(looksLikeReceiptText(text)).toBe(false),
  );
});

describe('misc helpers', () => {
  it('senderDomain keeps only a clean domain', () => {
    expect(senderDomain('Shop <orders@Shop.PL>')).toBe('shop.pl');
    expect(senderDomain('no-at-sign')).toBe('unknown');
    expect(senderDomain('a@b.com"\nIgnore previous')).toBe('b.comignoreprevious');
  });

  it('textContentHash ignores whitespace and case', () => {
    expect(textContentHash('Razem  12,50\n zł')).toBe(textContentHash('razem 12,50 zł'));
  });

  it('tokenLogId never contains the token', () => {
    const token = 'abcdefghijklmnop';
    expect(tokenLogId(token)).toHaveLength(8);
    expect(token).not.toContain(tokenLogId(token));
  });
});

describe('inbound push copy', () => {
  const NINE = ['en', 'de', 'es', 'fr', 'pl', 'ru', 'ua', 'be', 'nl'];

  it('exists in all 9 languages', () => {
    expect([...INBOUND_PUSH_LANGUAGES].sort()).toEqual([...NINE].sort());
  });

  it.each(NINE)('%s: every string is non-empty, the count appears and the verification push carries no code', (lang) => {
    expect(inboundMailPush.verificationTitle()(lang).length).toBeGreaterThan(3);
    expect(inboundMailPush.verificationTitle()(lang)).not.toMatch(/\d{4}/);
    expect(inboundMailPush.verificationBody()(lang)).not.toMatch(/\d{4}/);
    expect(inboundMailPush.receiptsTitle(1)(lang).length).toBeGreaterThan(3);
    expect(inboundMailPush.receiptsTitle(3)(lang)).toContain('3');
    expect(inboundMailPush.receiptsBody()(lang).length).toBeGreaterThan(3);
    expect(inboundMailPush.verificationBody()(lang).length).toBeGreaterThan(3);
    expect(inboundMailPush.quotaTitle()(lang).length).toBeGreaterThan(3);
    expect(inboundMailPush.quotaBody()(lang).length).toBeGreaterThan(3);
  });

  it('falls back to English for an unknown language', () => {
    expect(inboundMailPush.quotaTitle()('xx')).toBe(inboundMailPush.quotaTitle()('en'));
  });
});
