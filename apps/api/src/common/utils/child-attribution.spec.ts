import {
  benefitCoverage,
  carryChildAttribution,
  childAmounts,
  childCostSummary,
  isChildBenefitDescription,
  normalizeProductKey,
  resolveAttributionMode,
  type AttribExpense,
  type AttribItem,
} from './child-attribution';
import { normalizeProductName } from '../../modules/merchant-rules/product-rules.service';

const expense = (over: Partial<AttribExpense> = {}): AttribExpense => ({
  id: 'e1',
  amount: 100,
  currencyCode: 'PLN',
  date: '2026-11-03',
  categoryId: 'cat1',
  ...over,
});
const item = (over: Partial<AttribItem> = {}): AttribItem => ({
  expenseId: 'e1',
  totalPrice: 10,
  childId: null,
  categoryId: null,
  ...over,
});
const identity = (a: number) => a;

describe('childAmounts', () => {
  it('whole expense with two children splits equally', () => {
    const links = [
      { expenseId: 'e1', childId: 'A', share: 0.5 },
      { expenseId: 'e1', childId: 'B', share: 0.5 },
    ];
    const out = childAmounts(expense(), links, []);
    expect(out.map((r) => r.amount)).toEqual([50, 50]);
    expect(out.map((r) => r.childId).sort()).toEqual(['A', 'B']);
    expect(out[0].categoryId).toBe('cat1');
  });

  it('whole expense puts the rounding remainder on the largest share', () => {
    const links = [
      { expenseId: 'e1', childId: 'A', share: 1 / 3 },
      { expenseId: 'e1', childId: 'B', share: 1 / 3 },
      { expenseId: 'e1', childId: 'C', share: 1 / 3 },
    ];
    const out = childAmounts(expense({ amount: 100 }), links, []);
    expect(Math.round(out.reduce((s, r) => s + r.amount, 0) * 100)).toBe(10000);
  });

  it('lines: sums attributed lines and folds the receipt discount proportionally', () => {
    const items = [item({ totalPrice: 40, childId: 'A' }), item({ totalPrice: 60 })];
    const out = childAmounts(expense({ discountAmount: 10 }), [], items);
    expect(out).toEqual([{ childId: 'A', categoryId: 'cat1', amount: 36 }]);
  });

  it('lines: a discount whose proportional cuts do not sum exactly puts the remainder on the largest share', () => {
    const items = [
      item({ totalPrice: 20, childId: 'A' }),
      item({ totalPrice: 10, childId: 'B' }),
      item({ totalPrice: 10 }),
    ];
    const out = childAmounts(expense({ discountAmount: 0.99 }), [], items);
    const a = out.find((r) => r.childId === 'A')!;
    const b = out.find((r) => r.childId === 'B')!;
    expect(a.amount).toBe(19.51);
    expect(b.amount).toBe(9.75);
  });

  it('lines use the line category, falling back to the expense category, and net of lineDiscount', () => {
    const items = [
      item({ totalPrice: 20, lineDiscount: 5, childId: 'A', categoryId: 'toys' }),
      item({ totalPrice: 10, childId: 'A' }),
    ];
    const out = childAmounts(expense(), [], items);
    expect(out).toEqual(
      expect.arrayContaining([
        { childId: 'A', categoryId: 'toys', amount: 15 },
        { childId: 'A', categoryId: 'cat1', amount: 10 },
      ]),
    );
  });

  it('lines win over links', () => {
    const links = [{ expenseId: 'e1', childId: 'B', share: 1 }];
    const items = [item({ totalPrice: 30, childId: 'A' })];
    expect(resolveAttributionMode(links, items)).toBe('lines');
    expect(childAmounts(expense(), links, items)).toEqual([{ childId: 'A', categoryId: 'cat1', amount: 30 }]);
  });

  it('resolveAttributionMode: whole when only links, none otherwise', () => {
    expect(resolveAttributionMode([{ expenseId: 'e1', childId: 'A', share: 1 }], [item()])).toBe('whole');
    expect(resolveAttributionMode([], [item()])).toBe('none');
  });

  it('split receivable and planned expenses contribute nothing', () => {
    const links = [{ expenseId: 'e1', childId: 'A', share: 1 }];
    expect(childAmounts(expense({ isSplitReceivable: true }), links, [])).toEqual([]);
    expect(childAmounts(expense({ isPlanned: true }), links, [])).toEqual([]);
  });
});

describe('childCostSummary', () => {
  const now = new Date(2026, 10, 11, 12);

  it('excludes an unknown-rate amount and flags fxApproximate', () => {
    const expenses = [expense({ id: 'a', amount: 100 }), expense({ id: 'b', amount: 50, currencyCode: 'EUR' })];
    const links = [
      { expenseId: 'a', childId: 'A', share: 1 },
      { expenseId: 'b', childId: 'A', share: 1 },
    ];
    const s = childCostSummary({
      childId: 'A',
      expenses,
      links,
      items: [],
      convert: (amt, cur) => (cur === 'EUR' ? null : amt),
      now,
    });
    expect(s.yearTotal).toBe(100);
    expect(s.fxApproximate).toBe(true);
  });

  it('averagePerMonth divides by months since the first attributed month', () => {
    const expenses = [
      expense({ id: 'a', amount: 100, date: '2026-09-10' }),
      expense({ id: 'b', amount: 100, date: '2026-10-10' }),
      expense({ id: 'c', amount: 100, date: '2026-11-02' }),
    ];
    const links = expenses.map((e) => ({ expenseId: e.id, childId: 'A', share: 1 }));
    const s = childCostSummary({ childId: 'A', expenses, links, items: [], convert: identity, now });
    expect(s.averagePerMonth).toBe(100);
    expect(s.monthTotal).toBe(100);
    expect(s.months).toHaveLength(12);
    expect(s.months[11]).toEqual({ month: '2026-11', amount: 100 });
    expect(s.months[0].month).toBe('2025-12');
    expect(s.byCategory).toEqual([{ categoryId: 'cat1', amount: 300 }]);
  });

  it('averagePerMonth spans a year boundary', () => {
    const e = expense({ id: 'a', amount: 300, date: '2025-11-10' });
    const s = childCostSummary({
      childId: 'A',
      expenses: [e],
      links: [{ expenseId: 'a', childId: 'A', share: 1 }],
      items: [],
      convert: identity,
      now: new Date(2026, 0, 15, 12),
    });
    expect(s.averagePerMonth).toBe(100);
    expect(s.yearTotal).toBe(0);
  });

  it('ignores other children', () => {
    const links = [{ expenseId: 'e1', childId: 'B', share: 1 }];
    const s = childCostSummary({ childId: 'A', expenses: [expense()], links, items: [], convert: identity, now });
    expect(s.yearTotal).toBe(0);
    expect(s.averagePerMonth).toBe(0);
  });
});

describe('benefitCoverage', () => {
  const inc = (date: string, amount = 800) => ({
    amount,
    currencyCode: 'PLN',
    date,
    childBenefitChildId: 'A',
  });

  it('counts one payment per month', () => {
    const r = benefitCoverage({
      childId: 'A',
      incomes: [inc('2026-11-02'), inc('2026-11-15')],
      spending: 2000,
      from: '2026-11-01',
      to: '2026-11-30',
      convert: identity,
    });
    expect(r).toEqual({ benefit: 800, spending: 2000, percent: 40 });
  });

  it('percent is null when spending is 0', () => {
    const r = benefitCoverage({
      childId: 'A',
      incomes: [inc('2026-11-02')],
      spending: 0,
      from: '2026-11-01',
      to: '2026-11-30',
      convert: identity,
    });
    expect(r.percent).toBeNull();
  });

  it('ignores other children, out-of-range months and unknown rates', () => {
    const r = benefitCoverage({
      childId: 'A',
      incomes: [
        { ...inc('2026-11-02'), childBenefitChildId: 'B' },
        inc('2026-09-02'),
        { ...inc('2026-11-03'), currencyCode: 'EUR' },
      ],
      spending: 100,
      from: '2026-11-01',
      to: '2026-11-30',
      convert: (a, c) => (c === 'EUR' ? null : a),
    });
    expect(r.benefit).toBe(0);
  });
});

describe('isChildBenefitDescription', () => {
  it('matches the four patterns, diacritics and case insensitive', () => {
    expect(isChildBenefitDescription('ZUS 800+ wypłata')).toBe(true);
    expect(isChildBenefitDescription('Rodzina 800 plus')).toBe(true);
    expect(isChildBenefitDescription('swiadczenie wychowawcze')).toBe(true);
    expect(isChildBenefitDescription('Świadczenie Wychowawcze ZUS')).toBe(true);
    expect(isChildBenefitDescription('RODZINA 800')).toBe(true);
  });
  it('does not match unrelated text', () => {
    expect(isChildBenefitDescription('Faktura 800')).toBe(false);
    expect(isChildBenefitDescription('Faktura 1800 plus VAT')).toBe(false);
    expect(isChildBenefitDescription('')).toBe(false);
    expect(isChildBenefitDescription(null)).toBe(false);
  });
});

describe('carryChildAttribution', () => {
  it('keeps matched lines and counts lost', () => {
    const r = carryChildAttribution(
      [
        { description: 'Pampers', childId: 'A' },
        { description: 'Mleko', childId: null },
        { description: 'Chusteczki', childId: 'A' },
      ],
      [{ description: 'Pampers' }, { description: 'Chleb' }],
      normalizeProductKey,
    );
    expect(r).toEqual({ childIds: ['A', null], lost: 1 });
  });

  it('prefers canonicalName and matches each old line only once', () => {
    const r = carryChildAttribution(
      [{ description: 'x', canonicalName: 'Pampers 3', childId: 'A' }],
      [{ description: 'PAMPERS 3' }, { description: 'pampers-3' }],
      normalizeProductKey,
    );
    expect(r).toEqual({ childIds: ['A', null], lost: 0 });
  });
});

describe('normalizeProductKey parity with normalizeProductName', () => {
  const cases = [
    '  Mleko Łaciate 3,2% 1L ',
    'MasłExtraMIDol200g',
    'MaslExtraMIDol200g',
    'Woda Gaz Żyw 1,75l',
    'BatLetheAAA8szt',
    'Bat Lethe AAA 8 szt',
    'BurakiGotowane500 g',
    '  chust Dada 3x72szt',
    'Nap CocCola1,75l',
    'Nap CocCola1.75l',
    'PiwoŻywiec0,5lPusz',
    '',
  ];
  it.each(cases)('%j', (c) => {
    expect(normalizeProductKey(c)).toBe(normalizeProductName(c));
  });
  it('tolerates a nullish name like the original', () => {
    expect(normalizeProductKey(undefined as unknown as string)).toBe('');
  });
});
