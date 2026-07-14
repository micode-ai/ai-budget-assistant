import {
  buildCandidateLines,
  parseMatchedIndices,
  deterministicMatchIndices,
  selectByIndices,
  computeTotalsByCurrency,
  FilterExpense,
} from './semantic-filter';

const exp = (over: Partial<FilterExpense>): FilterExpense => ({
  id: 'x',
  description: null,
  merchant: null,
  category: null,
  amount: 0,
  currencyCode: 'PLN',
  ...over,
});

describe('semantic-filter util', () => {
  describe('buildCandidateLines', () => {
    it('numbers rows 1-based and appends merchant + category', () => {
      const lines = buildCandidateLines([
        exp({ description: 'Beer', merchant: 'Zabka', category: 'Groceries' }),
        exp({ description: 'Milk' }),
      ]);
      expect(lines).toBe('1. Beer [Zabka] (Groceries)\n2. Milk');
    });

    it('falls back to a placeholder for empty descriptions', () => {
      const lines = buildCandidateLines([exp({ description: '', merchant: 'Biedronka' })]);
      expect(lines).toBe('1. (no description) [Biedronka]');
    });
  });

  describe('parseMatchedIndices', () => {
    it('parses {"indices":[...]}', () => {
      expect([...parseMatchedIndices('{"indices":[1,3]}', 5)]).toEqual([1, 3]);
    });

    it('parses a bare JSON array', () => {
      expect([...parseMatchedIndices('[2, 4]', 5)]).toEqual([2, 4]);
    });

    it('accepts the legacy "ids" key holding numbers', () => {
      expect([...parseMatchedIndices('{"ids":[1,2]}', 5)]).toEqual([1, 2]);
    });

    it('discards out-of-range and non-integer indices', () => {
      expect([...parseMatchedIndices('{"indices":[0,1,6,3,"x",2.5]}', 5)]).toEqual([1, 3]);
    });

    it('falls back to regex on truncated / non-JSON output', () => {
      expect([...parseMatchedIndices('indices: 1, 2, and 3', 5)]).toEqual([1, 2, 3]);
    });

    it('returns empty for empty input or zero count', () => {
      expect(parseMatchedIndices('', 5).size).toBe(0);
      expect(parseMatchedIndices('{"indices":[1]}', 0).size).toBe(0);
    });

    it('does not double-count regex numbers when JSON already parsed', () => {
      // "indices" text contains no stray numbers; ensure valid JSON short-circuits regex
      expect([...parseMatchedIndices('{"indices":[2]}', 5)]).toEqual([2]);
    });
  });

  describe('deterministicMatchIndices', () => {
    it('matches substring in description case-insensitively', () => {
      const list = [exp({ description: 'ŻYWIEC beer' }), exp({ description: 'Milk' })];
      expect([...deterministicMatchIndices(list, 'żywiec')]).toEqual([1]);
    });

    it('matches on merchant and category too', () => {
      const list = [
        exp({ description: 'lunch', merchant: 'Netflix' }),
        exp({ description: 'x', category: 'Netflix bills' }),
        exp({ description: 'nope' }),
      ];
      expect([...deterministicMatchIndices(list, 'netflix')]).toEqual([1, 2]);
    });

    it('returns empty for a blank keyword', () => {
      expect(deterministicMatchIndices([exp({ description: 'a' })], '  ').size).toBe(0);
    });

    it('does NOT cross languages (that is the LLM job)', () => {
      // "пиво" is not a substring of "Beer" — deterministic pass correctly misses it
      expect(deterministicMatchIndices([exp({ description: 'Beer' })], 'пиво').size).toBe(0);
    });
  });

  describe('selectByIndices', () => {
    it('selects by 1-based index preserving order', () => {
      const list = [exp({ id: 'a' }), exp({ id: 'b' }), exp({ id: 'c' })];
      expect(selectByIndices(list, new Set([1, 3])).map((e) => e.id)).toEqual(['a', 'c']);
    });
  });

  describe('computeTotalsByCurrency', () => {
    it('sums per currency and rounds to cents', () => {
      const totals = computeTotalsByCurrency([
        exp({ amount: 10.1, currencyCode: 'PLN' }),
        exp({ amount: 5.05, currencyCode: 'PLN' }),
        exp({ amount: 2, currencyCode: 'USD' }),
      ]);
      expect(totals).toEqual({ PLN: 15.15, USD: 2 });
    });

    it('defaults missing currency to USD', () => {
      expect(computeTotalsByCurrency([exp({ amount: 3, currencyCode: null })])).toEqual({ USD: 3 });
    });
  });
});
