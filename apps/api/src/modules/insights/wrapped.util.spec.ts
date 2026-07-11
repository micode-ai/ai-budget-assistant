import {
  assembleWrapped,
  WrappedInputs,
  WrappedExpenseRow,
  WrappedIncomeRow,
  MIN_TRACKED_ROWS,
} from './wrapped.util';
import type {
  WrappedCard,
  WrappedTotalTrackedCard,
  WrappedTopMerchantCard,
  WrappedBiggestMonthCard,
  WrappedTopCategoryCard,
  WrappedCategoryMixCard,
  WrappedReceiptsScannedCard,
  WrappedSavingsCard,
  WrappedStreakCard,
  WrappedPersonalInflationCard,
} from '@budget/shared-types';

const GEN = '2027-01-01T00:00:00.000Z';

function exp(over: Partial<WrappedExpenseRow> = {}): WrappedExpenseRow {
  return {
    amount: 10,
    currencyCode: 'USD',
    year: 2026,
    month: 0,
    merchant: null,
    source: 'manual',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    ...over,
  };
}

function inc(over: Partial<WrappedIncomeRow> = {}): WrappedIncomeRow {
  return { amount: 100, currencyCode: 'USD', year: 2026, ...over };
}

function base(over: Partial<WrappedInputs> = {}): WrappedInputs {
  return {
    year: 2026,
    baseCurrency: 'USD',
    generatedAt: GEN,
    expenses: [],
    incomes: [],
    rates: null,
    inflationPct: null,
    streakLongest: 0,
    streakCurrent: 0,
    ...over,
  };
}

function card<T extends WrappedCard['type']>(
  res: { cards: WrappedCard[] },
  type: T,
): Extract<WrappedCard, { type: T }> | undefined {
  return res.cards.find((c) => c.type === type) as Extract<WrappedCard, { type: T }> | undefined;
}

describe('assembleWrapped', () => {
  it('returns hasEnoughData=false with no cards below the tracked-rows threshold', () => {
    const res = assembleWrapped(base({ expenses: [exp(), exp()], incomes: [inc()] }));
    expect(res.hasEnoughData).toBe(false);
    expect(res.cards).toHaveLength(0);
    expect(res.generatedAt).toBe(GEN);
  });

  it('assembles the full deck from a representative year', () => {
    const expenses: WrappedExpenseRow[] = [
      exp({ amount: 50, month: 7, merchant: 'Biedronka', categoryId: 'c1', categoryName: 'Groceries', categoryColor: '#0f0', source: 'ocr' }),
      exp({ amount: 30, month: 7, merchant: 'Biedronka', categoryId: 'c1', categoryName: 'Groceries', categoryColor: '#0f0' }),
      exp({ amount: 20, month: 7, merchant: 'Biedronka', categoryId: 'c1', categoryName: 'Groceries', categoryColor: '#0f0' }),
      exp({ amount: 40, month: 2, merchant: 'Shell', categoryId: 'c2', categoryName: 'Transport', categoryColor: '#00f' }),
      exp({ amount: 10, month: 2, merchant: 'Netflix', categoryId: 'c3', categoryName: 'Fun', categoryColor: '#f0f', source: 'notification' }),
    ];
    const incomes: WrappedIncomeRow[] = [inc({ amount: 1000 }), inc({ amount: 500, year: 2025 })];

    const res = assembleWrapped(
      base({ expenses, incomes, inflationPct: 4.2, streakLongest: 30, streakCurrent: 12 }),
    );

    expect(res.hasEnoughData).toBe(true);
    expect(res.fxApproximate).toBe(false);
    // intro + total + merchant + month + top_cat + mix + receipts + savings + inflation + streak + outro
    expect(res.cards[0].type).toBe('intro');
    expect(res.cards[res.cards.length - 1].type).toBe('outro');

    const total = card(res, 'total_tracked') as WrappedTotalTrackedCard;
    expect(total.totalExpenses).toBe(150);
    expect(total.totalIncome).toBe(1000);
    expect(total.transactionCount).toBe(6); // 5 expenses + 1 income in-year

    const merchant = card(res, 'top_merchant') as WrappedTopMerchantCard;
    expect(merchant.name).toBe('Biedronka'); // 3 visits beats Shell/Netflix
    expect(merchant.visits).toBe(3);
    expect(merchant.totalSpent).toBe(100);

    const month = card(res, 'biggest_month') as WrappedBiggestMonthCard;
    expect(month.monthIndex).toBe(7); // August: 100 > March's 50
    expect(month.month).toBe('2026-08');
    expect(month.amount).toBe(100);

    const topCat = card(res, 'top_category') as WrappedTopCategoryCard;
    expect(topCat.name).toBe('Groceries');
    expect(topCat.amount).toBe(100);
    expect(topCat.percentage).toBeCloseTo(66.7, 1);

    const mix = card(res, 'category_mix') as WrappedCategoryMixCard;
    expect(mix.categories.map((c) => c.name)).toEqual(['Groceries', 'Transport', 'Fun']);

    const receipts = card(res, 'receipts_scanned') as WrappedReceiptsScannedCard;
    expect(receipts.count).toBe(2); // one 'ocr' + one 'notification'

    const savings = card(res, 'savings') as WrappedSavingsCard;
    expect(savings.netSavings).toBe(850); // 1000 - 150
    expect(savings.savingsRate).toBeCloseTo(85, 1);
    expect(savings.savedVsLastYear).toBe(350); // 850 - (500 income - 0 expense in 2025)

    const inflation = card(res, 'personal_inflation') as WrappedPersonalInflationCard;
    expect(inflation.indexPct).toBe(4.2);

    const streak = card(res, 'streak') as WrappedStreakCard;
    expect(streak.longestStreak).toBe(30);
    expect(streak.currentStreak).toBe(12);
  });

  it('converts foreign-currency amounts and flags fxApproximate', () => {
    // rates are "1 USD = rate X"; a EUR amount converts as amount / rates['EUR']
    const rates = { EUR: 0.5 }; // 1 USD = 0.5 EUR → 50 EUR = 100 USD
    const expenses = [
      exp({ amount: 50, currencyCode: 'EUR', month: 1 }),
      exp({ amount: 10, currencyCode: 'USD', month: 1 }),
      exp({ amount: 10, currencyCode: 'USD', month: 1 }),
      exp({ amount: 10, currencyCode: 'USD', month: 1 }),
    ];
    const res = assembleWrapped(base({ expenses, incomes: [inc()], rates }));
    const total = card(res, 'total_tracked') as WrappedTotalTrackedCard;
    expect(res.fxApproximate).toBe(true);
    expect(total.totalExpenses).toBe(130); // 100 (from EUR) + 30
  });

  it('excludes amounts with an unknown rate instead of counting them wrong', () => {
    const expenses = [
      exp({ amount: 50, currencyCode: 'PLN', month: 1 }), // no rate → excluded
      exp({ amount: 10, currencyCode: 'USD', month: 1 }),
      exp({ amount: 10, currencyCode: 'USD', month: 1 }),
      exp({ amount: 10, currencyCode: 'USD', month: 1 }),
      exp({ amount: 10, currencyCode: 'USD', month: 1 }),
    ];
    const res = assembleWrapped(base({ expenses, rates: { EUR: 0.5 } }));
    const total = card(res, 'total_tracked') as WrappedTotalTrackedCard;
    expect(res.fxApproximate).toBe(true);
    expect(total.totalExpenses).toBe(40); // PLN row excluded, 4×10 USD counted
  });

  it('omits cards that have no data', () => {
    // 5 income-only rows: enough to pass the gate, but no merchant/category/month spend
    const res = assembleWrapped(
      base({ incomes: [inc(), inc(), inc(), inc(), inc()] }),
    );
    expect(res.hasEnoughData).toBe(true);
    expect(card(res, 'top_merchant')).toBeUndefined();
    expect(card(res, 'biggest_month')).toBeUndefined();
    expect(card(res, 'top_category')).toBeUndefined();
    expect(card(res, 'receipts_scanned')).toBeUndefined();
    expect(card(res, 'personal_inflation')).toBeUndefined();
    expect(card(res, 'streak')).toBeUndefined();
    // total + savings always present when there's enough data
    expect(card(res, 'total_tracked')).toBeDefined();
    expect(card(res, 'savings')).toBeDefined();
  });

  it('leaves savedVsLastYear null when there is no prior-year data', () => {
    const expenses = [exp(), exp(), exp(), exp()];
    const res = assembleWrapped(base({ expenses, incomes: [inc()] }));
    expect(res.cards.length).toBeGreaterThanOrEqual(MIN_TRACKED_ROWS - 1);
    const savings = card(res, 'savings') as WrappedSavingsCard;
    expect(savings.savedVsLastYear).toBeNull();
  });
});
