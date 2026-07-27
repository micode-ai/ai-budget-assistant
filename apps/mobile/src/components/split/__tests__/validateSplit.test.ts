import { validateSplit, MAX_SPLIT_PARTICIPANTS, type SplitParticipantCandidate } from '../validateSplit';

describe('validateSplit', () => {
  const participant = (
    overrides: Partial<SplitParticipantCandidate> = {},
  ): SplitParticipantCandidate => ({
    name: 'Alice',
    shareAmount: 10,
    ...overrides,
  });

  it('is valid for a normal split within the bill total', () => {
    expect(
      validateSplit([participant({ name: 'Alice' }), participant({ name: 'Bob' })], 100),
    ).toBe(true);
  });

  describe('participant count', () => {
    it('rejects zero participants', () => {
      expect(validateSplit([], 100)).toBe(false);
    });

    it('rejects more than 20 participants', () => {
      const tooMany = Array.from({ length: MAX_SPLIT_PARTICIPANTS + 1 }, (_, i) =>
        participant({ name: `Guest ${i}`, shareAmount: 1 }),
      );
      expect(validateSplit(tooMany, 1000)).toBe(false);
    });

    it('accepts exactly 20 participants', () => {
      const twenty = Array.from({ length: MAX_SPLIT_PARTICIPANTS }, (_, i) =>
        participant({ name: `Guest ${i}`, shareAmount: 1 }),
      );
      expect(validateSplit(twenty, 1000)).toBe(true);
    });
  });

  describe('participant name', () => {
    it('rejects a blank name', () => {
      expect(validateSplit([participant({ name: '   ' })], 100)).toBe(false);
    });

    it('rejects an empty-string name', () => {
      expect(validateSplit([participant({ name: '' })], 100)).toBe(false);
    });

    it('accepts a name with surrounding whitespace trimmed to something real', () => {
      expect(validateSplit([participant({ name: '  Bob  ' })], 100)).toBe(true);
    });
  });

  describe('shares vs. bill total', () => {
    it('rejects when shares exceed the bill total', () => {
      expect(
        validateSplit([participant({ shareAmount: 60 }), participant({ shareAmount: 60 })], 100),
      ).toBe(false);
    });

    it('accepts shares that sum exactly to the bill total', () => {
      expect(
        validateSplit([participant({ shareAmount: 50 }), participant({ shareAmount: 50 })], 100),
      ).toBe(true);
    });

    it('accepts shares within the 0.01 rounding tolerance', () => {
      expect(
        validateSplit(
          [participant({ shareAmount: 50.005 }), participant({ shareAmount: 50.005 })],
          100,
        ),
      ).toBe(true);
    });

    it('is valid even when shares are well under the bill total (unassigned items stay with the payer)', () => {
      expect(validateSplit([participant({ shareAmount: 5 })], 100)).toBe(true);
    });
  });
});
