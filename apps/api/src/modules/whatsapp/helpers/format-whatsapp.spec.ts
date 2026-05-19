import { markdownToWhatsApp } from './format-whatsapp';

describe('markdownToWhatsApp', () => {
  it('converts **bold** to *bold*', () => {
    expect(markdownToWhatsApp('Hello **world**')).toBe('Hello *world*');
  });

  it('converts *italic* to _italic_', () => {
    expect(markdownToWhatsApp('Some *italic* text')).toBe('Some _italic_ text');
  });

  it('keeps `code` as-is', () => {
    expect(markdownToWhatsApp('use `foo()` here')).toBe('use `foo()` here');
  });

  it('keeps ```block``` as-is', () => {
    expect(markdownToWhatsApp('```js\nfoo()\n```')).toBe('```js\nfoo()\n```');
  });

  it('handles mixed formatting (bold + italic + code)', () => {
    expect(markdownToWhatsApp('**Title**: *emphasis* and `code`'))
      .toBe('*Title*: _emphasis_ and `code`');
  });

  it('passes plain text through', () => {
    expect(markdownToWhatsApp('plain text here')).toBe('plain text here');
  });

  it('handles bold and italic on same line without collision', () => {
    expect(markdownToWhatsApp('**big** and *small*')).toBe('*big* and _small_');
  });
});
