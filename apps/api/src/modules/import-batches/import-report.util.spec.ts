import {
  buildImportReport,
  ImportReportExpenseRow,
  ImportReportInputs,
  MIN_REPORT_EXPENSES,
  niceBudget,
  seriesCycle,
} from './import-report.util';

let seq = 0;
function exp(over: Partial<ImportReportExpenseRow> = {}): ImportReportExpenseRow {
  seq += 1;
  return {
    id: `e${seq}`,
    amount: 10,
    currencyCode: 'PLN',
    date: new Date('2026-07-01T12:00:00Z'),
    merchant: null,
    description: null,
    categoryId: 'cat-food',
    categoryName: 'Food',
    categoryColor: '#0f0',
    ...over,
  };
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

function build(over: Partial<ImportReportInputs> = {}) {
  return buildImportReport({
    batchId: 'b1',
    baseCurrency: 'PLN',
    expenses: [],
    incomes: [],
    rates: null,
    trackedSubscriptionNames: new Set(),
    budgetedCategoryIds: new Set(),
    ...over,
  });
}

/** Filler spread over three months (Jul 1 – Sep 21) so the report clears the threshold. */
const filler = () =>
  Array.from({ length: MIN_REPORT_EXPENSES }, (_, i) =>
    exp({ date: new Date(day('2026-07-01').getTime() + i * 9 * 86_400_000), amount: 30 }),
  );

describe('niceBudget', () => {
  it('rounds up to a typeable step', () => {
    expect(niceBudget(43)).toBe(50);
    expect(niceBudget(412)).toBe(450);
    expect(niceBudget(1234)).toBe(1300);
    expect(niceBudget(0)).toBe(0);
  });
});

describe('seriesCycle', () => {
  it('accepts two monthly-spaced charges', () => {
    expect(seriesCycle([day('2026-07-03'), day('2026-08-03')])).toBe('monthly');
  });
  it('needs three charges for weekly', () => {
    expect(seriesCycle([day('2026-07-01'), day('2026-07-08')])).toBeNull();
    expect(seriesCycle([day('2026-07-01'), day('2026-07-08'), day('2026-07-15')])).toBe('weekly');
  });
  it('rejects irregular spacing', () => {
    expect(seriesCycle([day('2026-07-01'), day('2026-07-12')])).toBeNull();
  });
});

describe('buildImportReport', () => {
  it('reports nothing below the threshold', () => {
    const res = build({ expenses: filler().slice(1) });
    expect(res.hasEnoughData).toBe(false);
    expect(res.categories).toEqual([]);
  });

  it('covers the period and averages per month', () => {
    const res = build({ expenses: filler() });
    expect(res.hasEnoughData).toBe(true);
    expect(res.monthsCovered).toBe(3);
    expect(res.totalSpent).toBe(300);
    expect(res.monthlyAverageSpend).toBe(100);
  });

  it('finds an untracked monthly subscription and skips a tracked one', () => {
    const subs = [
      exp({ merchant: 'StreamCo', amount: 29.99, date: day('2026-07-02') }),
      exp({ merchant: 'StreamCo', amount: 29.99, date: day('2026-08-02') }),
      exp({ merchant: 'Gym', amount: 99, date: day('2026-07-10') }),
      exp({ merchant: 'Gym', amount: 99, date: day('2026-08-10') }),
    ];
    const res = build({ expenses: [...filler(), ...subs], trackedSubscriptionNames: new Set(['gym']) });
    expect(res.subscriptions).toHaveLength(1);
    expect(res.subscriptions[0]).toMatchObject({
      name: 'StreamCo',
      amount: 29.99,
      billingCycle: 'monthly',
      charges: 2,
      lastDate: '2026-08-02',
      nextRenewalDate: '2026-09-02',
    });
  });

  it('pairs a possible duplicate within a day, once', () => {
    const dup = [
      exp({ merchant: 'Shop', amount: 55, date: day('2026-07-20') }),
      exp({ merchant: 'shop', amount: 55, date: new Date('2026-07-21T08:00:00Z') }),
      exp({ merchant: 'Shop', amount: 55, date: day('2026-07-25') }),
    ];
    const res = build({ expenses: [...filler(), ...dup] });
    expect(res.duplicates).toHaveLength(1);
    expect(res.duplicates[0]).toMatchObject({ payee: 'Shop', amount: 55, date: '2026-07-20' });
  });

  it('suggests budgets only for categories without one', () => {
    const rows = [...filler(), exp({ categoryId: 'cat-home', categoryName: 'Home', amount: 600, date: day('2026-08-15') })];
    const res = build({ expenses: rows, budgetedCategoryIds: new Set(['cat-food']) });
    expect(res.budgetSuggestions).toEqual([{ categoryId: 'cat-home', name: 'Home', monthlyAmount: 200 }]);
  });

  it('excludes an amount with an unknown rate from totals', () => {
    const res = build({ expenses: [...filler(), exp({ currencyCode: 'XYZ', amount: 1000 })], rates: { EUR: 0.23 } });
    expect(res.fxApproximate).toBe(true);
    expect(res.totalSpent).toBe(300);
  });
});
