import { sniffReceiptContentType } from './receipt-content-type';

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string, pad = 0) => Buffer.concat([Buffer.from(text, 'ascii'), Buffer.alloc(pad)]);

describe('sniffReceiptContentType', () => {
  it('recognizes a JPEG', () => {
    expect(sniffReceiptContentType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe('image/jpeg');
  });

  it('recognizes a PNG', () => {
    expect(sniffReceiptContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe('image/png');
  });

  it('recognizes a WebP', () => {
    const webp = Buffer.concat([ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WEBP')]);
    expect(sniffReceiptContentType(webp)).toBe('image/webp');
  });

  it('recognizes a PDF', () => {
    // 93 of the receipts stored in production are PDFs, so this is not an edge case.
    expect(sniffReceiptContentType(ascii('%PDF-1.4\n%âãÏÓ'))).toBe('application/pdf');
  });

  it('recognizes a HEIC', () => {
    const heic = Buffer.concat([bytes(0, 0, 0, 0x18), ascii('ftypheic'), bytes(0, 0, 0, 0)]);
    expect(sniffReceiptContentType(heic)).toBe('image/heic');
  });

  it('refuses bytes it cannot identify rather than guessing', () => {
    // Guessing here is what turns a stored file into whatever the browser
    // decides to execute. Nothing recognizable means nothing served.
    expect(sniffReceiptContentType(ascii('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffReceiptContentType(Buffer.alloc(0))).toBeNull();
    expect(sniffReceiptContentType(bytes(0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08))).toBeNull();
  });

  it('ignores a caller-supplied content type completely', () => {
    // SaveReceiptImageDto.mimeType is a bare @IsString() — any signed-in user
    // can store any string there. It must never reach a Content-Type header on
    // this unauthenticated route.
    expect(sniffReceiptContentType(ascii('<html>hi'), 'image/jpeg')).toBeNull();
    expect(sniffReceiptContentType(bytes(0xff, 0xd8, 0xff), 'text/html')).toBe('image/jpeg');
  });

  it('is not fooled by a signature appearing later in the file', () => {
    expect(sniffReceiptContentType(Buffer.concat([ascii('junk'), bytes(0xff, 0xd8, 0xff)]))).toBeNull();
  });
});
