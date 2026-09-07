import {
  groupByDay, facetCounts, countsForFacet, summarise, rangeBetween, type LedgerRow,
} from '../desktopTable';

const exp = (id: string, date: string, amount: number, extra: Record<string, unknown> = {}): LedgerRow => ({
  kind: 'expense',
  expense: {
    id, date: new Date(date), amount, currencyCode: 'PLN',
    description: 'x', categoryId: 'cat-food', accountId: 'acc-1',
    isDeleted: false, ...extra,
  } as never,
});
const inc = (id: string, date: string, amount: number, extra: Record<string, unknown> = {}): LedgerRow => ({
  kind: 'income',
  income: {
    id, date: new Date(date), amount, currencyCode: 'PLN', accountId: 'acc-1',
    isDeleted: false, ...extra,
  } as never,
});

describe('groupByDay', () => {
  it('emits one group per calendar day, newest first, preserving row order inside a day', () => {
    const out = groupByDay([
      exp('a', new Date(2026, 8, 2, 10, 0).toISOString(), 100),
      exp('b', new Date(2026, 8, 2, 18, 0).toISOString(), 50),
      exp('c', new Date(2026, 8, 1, 9, 0).toISOString(), 25),
    ]);

    expect(out.map((g) => g.day)).toEqual(['2026-09-02', '2026-09-01']);
    expect(out[0].rows.map((r) => (r.kind === 'expense' ? r.expense.id : ''))).toEqual(['a', 'b']);
  });

  it('subtotals expenses only — a salary must not net against groceries', () => {
    const out = groupByDay([exp('a', new Date(2026, 8, 2, 10, 0).toISOString(), 100), inc('s', new Date(2026, 8, 2, 11, 0).toISOString(), 12400)]);

    expect(out).toHaveLength(1);
    expect(out[0].rows).toHaveLength(2);
    expect(out[0].expenseSubtotal).toBe(100);
  });

  it('excludes a split receivable from the subtotal but still shows the row', () => {
    // filterConsumption's rule: the money already left as the original receipt,
    // so the receivable is visible as a debt but is not spend.
    const out = groupByDay([
      exp('a', new Date(2026, 8, 2, 10, 0).toISOString(), 100),
      exp('r', new Date(2026, 8, 2, 11, 0).toISOString(), 40, { isDebt: true, isSplitReceivable: true }),
    ]);

    expect(out[0].rows).toHaveLength(2);
    expect(out[0].expenseSubtotal).toBe(100);
  });

  it('still counts a plain debt as spend — the wrong field here would rewrite every debt-tracker`s totals', () => {
    // A standalone cash loan's debt row IS the outflow, unlike a split
    // receivable. `isSpend` must key off isSplitReceivable, never isDebt.
    const out = groupByDay([exp('d', new Date(2026, 8, 2, 10, 0).toISOString(), 500, { isDebt: true })]);

    expect(out[0].expenseSubtotal).toBe(500);
  });

  it('is empty for no rows rather than producing an empty group', () => {
    expect(groupByDay([])).toEqual([]);
  });

  it('groups across a month boundary with newest first', () => {
    const out = groupByDay([
      exp('a', new Date(2026, 8, 1, 10, 0).toISOString(), 100),
      exp('b', new Date(2026, 7, 31, 18, 0).toISOString(), 50),
    ]);

    expect(out.map((g) => g.day)).toEqual(['2026-09-01', '2026-08-31']);
    expect(out[0].expenseSubtotal).toBe(100);
    expect(out[1].expenseSubtotal).toBe(50);
  });
});

describe('facetCounts', () => {
  it('counts expense rows per key', () => {
    const counts = facetCounts(
      [exp('a', '2026-09-02', 10), exp('b', '2026-09-02', 10), exp('c', '2026-09-02', 10, { categoryId: 'cat-house' })],
      'categoryId',
    );

    expect(counts.get('cat-food')).toBe(2);
    expect(counts.get('cat-house')).toBe(1);
  });

  it('buckets a missing key under an empty string rather than dropping the row', () => {
    const counts = facetCounts([exp('a', '2026-09-02', 10, { categoryId: undefined })], 'categoryId');

    expect(counts.get('')).toBe(1);
  });

  it('counts merchant facet with missing values bucketed as empty string', () => {
    const counts = facetCounts(
      [exp('a', '2026-09-02', 10, { merchant: 'Biedronka' }), exp('b', '2026-09-02', 10, { merchant: undefined })],
      'merchant',
    );

    expect(counts.get('Biedronka')).toBe(1);
    expect(counts.get('')).toBe(1);
  });

  it('contributes to the categoryId facet — Income.categoryId exists, unlike merchant', () => {
    // The comment this replaces claimed income has neither a merchant nor a
    // category facet. Only merchant is actually missing from `Income`
    // (packages/shared-types/src/entities/income.ts) — categoryId and
    // accountId both exist there too, and `TransactionTable`'s own
    // `rowCategoryId` already reads and renders `income.categoryId`.
    const counts = facetCounts([inc('s', '2026-09-02', 12400, { categoryId: 'cat-salary' })], 'categoryId');

    expect(counts.get('cat-salary')).toBe(1);
  });

  it('is absent from the merchant facet — merchant does not exist on Income at all', () => {
    expect(facetCounts([inc('s', '2026-09-02', 100)], 'merchant').size).toBe(0);
  });
});

describe('countsForFacet', () => {
  // The number beside a facet must describe the list that facet would produce.
  // Counting against the unfiltered set is the classic faceted-search bug: the
  // user sees "Хозтовары 12", clicks it, and gets 3.
  const rows = [
    exp('a', '2026-09-02', 10, { categoryId: 'cat-food', accountId: 'acc-1', merchant: 'Biedronka' }),
    exp('b', '2026-09-02', 10, { categoryId: 'cat-food', accountId: 'acc-2', merchant: 'Lidl' }),
    exp('c', '2026-09-02', 10, { categoryId: 'cat-house', accountId: 'acc-1', merchant: 'Lidl' }),
    exp('d', '2026-09-02', 10, { categoryId: 'cat-house', accountId: 'acc-2', merchant: 'Biedronka' }),
  ];
  const none = { categoryId: [], accountId: [], merchant: [] };

  it('counts against the whole set when nothing is active', () => {
    const out = countsForFacet(rows, none, 'categoryId');

    expect(out.get('cat-food')).toBe(2);
    expect(out.get('cat-house')).toBe(2);
  });

  it('counts category against an active ACCOUNT filter', () => {
    const out = countsForFacet(rows, { ...none, accountId: ['acc-1'] }, 'categoryId');

    expect(out.get('cat-food')).toBe(1);
    expect(out.get('cat-house')).toBe(1);
  });

  it('ignores its OWN group, so a selected facet still shows what selecting a sibling would give', () => {
    // With Продукты selected, the Хозтовары count must not collapse to 0 —
    // otherwise the user can never see what switching to it would produce.
    const out = countsForFacet(rows, { ...none, categoryId: ['cat-food'] }, 'categoryId');

    expect(out.get('cat-food')).toBe(2);
    expect(out.get('cat-house')).toBe(2);
  });

  it('unions within a group and intersects across groups', () => {
    const out = countsForFacet(
      rows,
      { ...none, accountId: ['acc-1', 'acc-2'], merchant: [] },
      'categoryId',
    );

    expect(out.get('cat-food')).toBe(2);
  });

  it('intersects constraints across multiple non-target groups', () => {
    // The intersection of acc-1 AND Biedronka contains only row a
    // (cat-food, acc-1, Biedronka). Row d is cat-house but acc-2.
    const out = countsForFacet(
      rows,
      { ...none, accountId: ['acc-1'], merchant: ['Biedronka'] },
      'categoryId',
    );

    expect(out.get('cat-food')).toBe(1);
    expect(out.get('cat-house')).toBeUndefined();
  });

  it('narrows an income row on categoryId like any other row', () => {
    // This function held a second copy of the "income has no category" claim
    // (`if (r.kind !== 'expense') return false`), so an income row could never
    // survive narrowing and its category could never appear beside a facet.
    const out = countsForFacet(
      [...rows, inc('s', '2026-09-02', 12400, { categoryId: 'cat-salary', accountId: 'acc-1' })],
      { ...none, accountId: ['acc-1'] },
      'categoryId',
    );

    expect(out.get('cat-salary')).toBe(1);
  });

  it('drops an income row whenever a merchant constraint is active', () => {
    // Strict intersection in the one direction income genuinely cannot satisfy:
    // `Income` has no merchant, so it fails the constraint rather than passing
    // it vacuously.
    const out = countsForFacet(
      [...rows, inc('s', '2026-09-02', 12400, { categoryId: 'cat-salary', accountId: 'acc-1' })],
      { ...none, merchant: ['Lidl'] },
      'categoryId',
    );

    expect(out.get('cat-salary')).toBeUndefined();
    expect(out.get('cat-food')).toBe(1);
  });
});

describe('summarise', () => {
  it('keeps currencies apart and never blends them', () => {
    const out = summarise([
      exp('a', '2026-09-02', 100),
      exp('b', '2026-09-02', 25, { currencyCode: 'EUR' }),
      inc('s', '2026-09-02', 12400),
    ]);

    expect(out.spentByCurrency.get('PLN')).toBe(100);
    expect(out.spentByCurrency.get('EUR')).toBe(25);
    expect(out.earnedByCurrency.get('PLN')).toBe(12400);
    expect(out.count).toBe(3);
  });

  it('excludes a split receivable from spend, matching the day subtotal', () => {
    const out = summarise([exp('r', '2026-09-02', 40, { isDebt: true, isSplitReceivable: true })]);

    expect(out.spentByCurrency.size).toBe(0);
    expect(out.count).toBe(1);
  });

  it('still counts a plain debt as spend — the wrong field would rewrite every debt-tracker`s totals', () => {
    const out = summarise([exp('d', '2026-09-02', 500, { isDebt: true })]);

    expect(out.spentByCurrency.get('PLN')).toBe(500);
    expect(out.count).toBe(1);
  });

  it('returns empty maps and a zero count for no rows — never NaN', () => {
    const out = summarise([]);

    expect(out.count).toBe(0);
    expect([...out.spentByCurrency.keys()]).toEqual([]);
  });
});

describe('rangeBetween', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('returns the inclusive range in visible order', () => {
    expect(rangeBetween('b', 'd', ids)).toEqual(['b', 'c', 'd']);
  });

  it('works when the user shift-clicks upward', () => {
    expect(rangeBetween('d', 'b', ids)).toEqual(['b', 'c', 'd']);
  });

  it('is a single id when the anchor and target are the same row', () => {
    expect(rangeBetween('c', 'c', ids)).toEqual(['c']);
  });

  it('returns nothing when either id has scrolled out of the filtered view', () => {
    // A bulk selection over money rows must never guess at a row it cannot see.
    expect(rangeBetween('b', 'zzz', ids)).toEqual([]);
    expect(rangeBetween('zzz', 'b', ids)).toEqual([]);
  });
});
