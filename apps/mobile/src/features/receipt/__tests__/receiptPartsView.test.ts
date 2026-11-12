import { mergeReceiptParts, localExtraParts, extraPartsOf } from '../receiptPartsView';

const p = (index: number, imageBase64: string) => ({ index, imageBase64, mimeType: 'image/jpeg' });

describe('receiptPartsView', () => {
  it('local parts win; server parts fill gaps; sorted by index', () => {
    const merged = mergeReceiptParts([p(3, 'L3')], [p(4, 'S4'), p(3, 'S3'), p(2, 'S2')]);
    expect(merged.map((x) => [x.index, x.imageBase64])).toEqual([
      [2, 'S2'],
      [3, 'L3'],
      [4, 'S4'],
    ]);
  });

  it('numbers local parts 2..N by position', () => {
    expect(localExtraParts([{ imageBase64: 'a', mimeType: 'image/jpeg' }, { imageBase64: 'b', mimeType: 'image/png' }])).toEqual([
      p(2, 'a'),
      { index: 3, imageBase64: 'b', mimeType: 'image/png' },
    ]);
  });

  it('extraPartsOf drops part 1 and tolerates unsorted input', () => {
    expect(extraPartsOf([p(3, 'c'), p(1, 'a'), p(2, 'b')]).map((x) => x.index)).toEqual([2, 3]);
  });

  it('ignores out-of-range indexes', () => {
    expect(mergeReceiptParts([], [p(5, 'x'), p(0, 'y')])).toEqual([]);
  });
});
