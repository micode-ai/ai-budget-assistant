import * as iconv from 'iconv-lite';
import { decodeCsvBuffer } from './encoding';

describe('decodeCsvBuffer', () => {
  it('decodes UTF-8 with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Data;Kwota\nĄĆĘ;1,00', 'utf-8')]);
    expect(decodeCsvBuffer(buf)).toBe('Data;Kwota\nĄĆĘ;1,00');
  });

  it('decodes UTF-8 without BOM', () => {
    const buf = Buffer.from('Data;Kwota\nĄĆĘ;1,00', 'utf-8');
    expect(decodeCsvBuffer(buf)).toBe('Data;Kwota\nĄĆĘ;1,00');
  });

  it('decodes Windows-1250 fallback', () => {
    const text = 'Data;Kwota\nĄĆĘ;1,00';
    const buf = iconv.encode(text, 'windows-1250');
    expect(decodeCsvBuffer(buf)).toBe(text);
  });

  it('honors explicit encoding override', () => {
    const buf = iconv.encode('Test;Łań', 'windows-1250');
    expect(decodeCsvBuffer(buf, 'windows-1250')).toBe('Test;Łań');
  });

  it('does not throw on all-zero bytes', () => {
    const buf = Buffer.from([0x00, 0x00]);
    expect(() => decodeCsvBuffer(buf)).not.toThrow();
  });
});
