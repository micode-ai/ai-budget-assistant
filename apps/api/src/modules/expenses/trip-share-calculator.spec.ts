import { resolveShares } from './trip-share-calculator';

describe('resolveShares', () => {
  it('splits equally, assigning the rounding remainder to the last participant', () => {
    const result = resolveShares(100, 'equal', [
      { userId: 'a', value: 0 },
      { userId: 'b', value: 0 },
      { userId: 'c', value: 0 },
    ]);
    expect(result).toEqual([
      { userId: 'a', shareAmount: 33.33 },
      { userId: 'b', shareAmount: 33.33 },
      { userId: 'c', shareAmount: 33.34 },
    ]);
  });

  it('uses exact values and validates they sum to the total', () => {
    const result = resolveShares(90, 'exact', [
      { userId: 'a', value: 60 },
      { userId: 'b', value: 30 },
    ]);
    expect(result).toEqual([
      { userId: 'a', shareAmount: 60 },
      { userId: 'b', shareAmount: 30 },
    ]);
  });

  it('throws when exact values do not sum to the total', () => {
    expect(() =>
      resolveShares(90, 'exact', [
        { userId: 'a', value: 60 },
        { userId: 'b', value: 20 },
      ]),
    ).toThrow('Exact shares must sum to 90, got 80');
  });

  it('splits by percentage', () => {
    const result = resolveShares(200, 'percentage', [
      { userId: 'a', value: 25 },
      { userId: 'b', value: 75 },
    ]);
    expect(result).toEqual([
      { userId: 'a', shareAmount: 50 },
      { userId: 'b', shareAmount: 150 },
    ]);
  });

  it('splits by shares (units)', () => {
    const result = resolveShares(90, 'shares', [
      { userId: 'a', value: 2 },
      { userId: 'b', value: 1 },
    ]);
    expect(result).toEqual([
      { userId: 'a', shareAmount: 60 },
      { userId: 'b', shareAmount: 30 },
    ]);
  });

  it('throws when total share units are zero', () => {
    expect(() =>
      resolveShares(90, 'shares', [
        { userId: 'a', value: 0 },
        { userId: 'b', value: 0 },
      ]),
    ).toThrow('Total share units must be greater than zero');
  });
});
