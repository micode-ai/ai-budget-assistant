import { validateTripSplit, type TripExpenseShareValue } from '../TripExpenseSplitPicker';

describe('validateTripSplit', () => {
  const shares = (values: number[]): TripExpenseShareValue[] =>
    values.map((value, i) => ({ userId: `u${i}`, value }));

  it('is always valid for the equal split type regardless of share values', () => {
    expect(validateTripSplit('equal', shares([1, 2, 3]), 100)).toBe(true);
    expect(validateTripSplit('equal', [], 100)).toBe(true);
  });

  it('is always valid for the shares (ratio) split type', () => {
    expect(validateTripSplit('shares', shares([1, 2, 3]), 100)).toBe(true);
  });

  describe('exact split type', () => {
    it('is valid when share values sum exactly to the total', () => {
      expect(validateTripSplit('exact', shares([30, 30, 40]), 100)).toBe(true);
    });

    it('is valid within the 0.01 rounding tolerance', () => {
      expect(validateTripSplit('exact', shares([33.33, 33.33, 33.34]), 100)).toBe(true);
    });

    it('is invalid when share values do not sum to the total', () => {
      expect(validateTripSplit('exact', shares([30, 30, 30]), 100)).toBe(false);
    });

    it('is invalid when share values overshoot the total', () => {
      expect(validateTripSplit('exact', shares([60, 60]), 100)).toBe(false);
    });
  });

  describe('percentage split type', () => {
    it('is valid when percentages sum to 100', () => {
      expect(validateTripSplit('percentage', shares([50, 25, 25]), 200)).toBe(true);
    });

    it('is invalid when percentages do not sum to 100', () => {
      expect(validateTripSplit('percentage', shares([50, 25]), 200)).toBe(false);
    });
  });
});
