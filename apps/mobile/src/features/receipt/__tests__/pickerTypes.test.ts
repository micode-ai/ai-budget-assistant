import { isPdfAsset } from '../pickerTypes';

describe('isPdfAsset', () => {
  it('trusts the mime type when the platform reports one', () => {
    expect(isPdfAsset('application/pdf', 'paragon.pdf')).toBe(true);
    expect(isPdfAsset('image/jpeg', 'paragon.jpg')).toBe(false);
  });

  it('accepts the mime type whatever its casing', () => {
    expect(isPdfAsset('APPLICATION/PDF', undefined)).toBe(true);
  });

  it('falls back to the filename only when no mime type was reported', () => {
    expect(isPdfAsset(undefined, 'paragon.PDF')).toBe(true);
    expect(isPdfAsset('', 'paragon.pdf')).toBe(true);
    expect(isPdfAsset(null, 'paragon')).toBe(false);
  });

  it('does not let a filename override a mime type that disagrees', () => {
    // A photo exported as "receipt.pdf.jpg" is a photo; the browser knows it and
    // says so, and treating it as a PDF would send it down the wrong parser.
    expect(isPdfAsset('image/jpeg', 'receipt.pdf.jpg')).toBe(false);
  });

  it('treats a missing name and a missing mime type as not-a-PDF', () => {
    expect(isPdfAsset(undefined, undefined)).toBe(false);
  });
});
