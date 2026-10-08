import {
  assembleMonthlyWrapped,
  MonthlyWrappedExpenseRow,
  MonthlyWrappedIncomeRow,
  MonthlyWrappedInputs,
  MIN_HABIT_VISITS,
} from './wrapped-monthly.util';
import { MIN_TRACKED_ROWS } from './wrapped.util';
import { previousMonth, monthlyWrappedDedupKey } from './monthly-wrapped-notify.cron';
import type {
  WrappedBiggestPurchaseCard,
  WrappedBusiestWeekdayCard,
  WrappedCard,
  WrappedVsLastMonthCard,
  WrappedTotalTrackedCard,
} from '@budget/shared-types';

const GEN = '2026-10-01T09:00:00.000Z';

function exp(over: Partial<MonthlyWrappedExpenseRow> = {}): MonthlyWrappedExpenseRow {
  return {
    amount: 10,
    currencyCode: 'PLN',
    inMonth: true,
    date: '2026-09-01',
    weekday: 2,
    merchant: null,
    source: 'manual',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    ...over,
  };
}

function inc(over: Partial<MonthlyWrappedIncomeRow> = {}): MonthlyWrappedIncomeRow {
  return { amount: 1000, currencyCode: 'PLN', inMonth: true, ...over };
}

function build(over: Partial<MonthlyWrappedInputs> = {}) {
  return assembleMonthlyWrapped({
    year: 2026,
    month: 9,
    baseCurrency: 'PLN',
    generatedAt: GEN,
    expenses: [],
    incomes: [],
    rates: null,
    streakLongest: 0,
    streakCurrent: 0,
    ...over,
  });
}

function card<T extends WrappedCard>(cards: WrappedCard[], type: T['type']): T | undefined {
  return cards.find((c) => c.type === type) as T | undefined;
}

const fiveRows = () => Array.from({ length: MIN_TRACKED_ROWS }, () => exp());

describe('assembleMonthlyWrapped', () => {
  it('returns no cards below the data threshold, and carries the month', () => {
    const res = build({ expenses: fiveRows().slice(1) });
    expect(res.hasEnoughData).toBe(false);
    expect(res.cards).toEqual([]);
    expect(res.month).toBe(9);
  });

  it('does not count previous-month rows toward the threshold', () => {
    const res = build({ expenses: [...fiveRows().slice(1), exp({ inMonth: false })] });
    expect(res.hasEnoughData).toBe(false);
  });

  it('opens and closes with month-tagged intro and outro', () => {
    const res = build({ expenses: fiveRows() });
    expect(res.cards[0]).toEqual({ type: 'intro', year: 2026, month: 9, baseCurrency: 'PLN' });
    expect(res.cards[res.cards.length - 1]).toEqual({ type: 'outro', year: 2026, month: 9 });
  });

  it('totals only this month', () => {
    const res = build({ expenses: [...fiveRows(), exp({ inMonth: false, amount: 500 })] });
    expect(card<WrappedTotalTrackedCard>(res.cards, 'total_tracked')?.totalExpenses).toBe(50);
  });

  it('compares with last month only when last month had spend', () => {
    expect(card(build({ expenses: fiveRows() }).cards, 'vs_last_month')).toBeUndefined();
    const res = build({ expenses: [...fiveRows(), exp({ inMonth: false, amount: 40 })] });
    const vs = card<WrappedVsLastMonthCard>(res.cards, 'vs_last_month');
    expect(vs).toMatchObject({ totalExpenses: 50, prevTotalExpenses: 40, changePct: 25 });
  });

  it('picks the biggest single purchase', () => {
    const res = build({
      expenses: [...fiveRows(), exp({ amount: 300, merchant: ' Shop ', categoryName: 'Home', date: '2026-09-14' })],
    });
    expect(card<WrappedBiggestPurchaseCard>(res.cards, 'biggest_purchase')).toMatchObject({
      amount: 300,
      merchant: 'Shop',
      categoryName: 'Home',
      date: '2026-09-14',
    });
  });

  it('finds the priciest weekday', () => {
    const res = build({ expenses: [...fiveRows(), exp({ weekday: 6, amount: 100 })] });
    expect(card<WrappedBusiestWeekdayCard>(res.cards, 'busiest_weekday')).toMatchObject({ weekday: 6, amount: 100 });
  });

  it('shows a merchant habit only from MIN_HABIT_VISITS visits', () => {
    const once = build({ expenses: [...fiveRows(), exp({ merchant: 'Cafe' })] });
    expect(card(once.cards, 'top_merchant')).toBeUndefined();
    const habit = build({
      expenses: [...fiveRows(), ...Array.from({ length: MIN_HABIT_VISITS }, () => exp({ merchant: 'Cafe' }))],
    });
    expect(card(habit.cards, 'top_merchant')).toMatchObject({ name: 'Cafe', visits: MIN_HABIT_VISITS });
  });

  it('shows savings only when the month had income, never a year comparison', () => {
    expect(card(build({ expenses: fiveRows() }).cards, 'savings')).toBeUndefined();
    const res = build({ expenses: fiveRows(), incomes: [inc()] });
    expect(card(res.cards, 'savings')).toMatchObject({ netSavings: 950, savedVsLastYear: null });
  });

  it('excludes an amount with an unknown rate and flags it', () => {
    const res = build({ expenses: [...fiveRows(), exp({ currencyCode: 'XYZ', amount: 999 })], rates: { EUR: 0.23 } });
    expect(res.fxApproximate).toBe(true);
    expect(card<WrappedTotalTrackedCard>(res.cards, 'total_tracked')?.totalExpenses).toBe(50);
  });
});

describe('monthly wrapped cron helpers', () => {
  it('previousMonth wraps January to December of the year before', () => {
    expect(previousMonth(new Date(2027, 0, 1, 9))).toEqual({ year: 2026, month: 12 });
    expect(previousMonth(new Date(2026, 9, 1, 9))).toEqual({ year: 2026, month: 9 });
  });

  it('dedup key is per user and month', () => {
    expect(monthlyWrappedDedupKey('u1', 2026, 9)).toBe('wrapped:u1:2026-09');
  });
});
