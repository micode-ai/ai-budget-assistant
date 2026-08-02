import { computeBudgetPeriod } from './budget-period.util';

const monthly = { period: 'monthly', startDate: new Date(2026, 0, 1), endDate: null };

describe('computeBudgetPeriod with a financial-month anchor', () => {
  it('without an anchor, behaves exactly as before', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(monthly, new Date(2026, 7, 15));
    expect(periodStart).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(periodEnd).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('shifts the monthly window to the anchor', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(monthly, new Date(2026, 7, 15), 10);
    expect(periodStart).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
    expect(periodEnd).toEqual(new Date(2026, 8, 9, 23, 59, 59, 999));
  });

  it('leaves daily, weekly and yearly untouched', () => {
    const now = new Date(2026, 7, 15);
    const daily = computeBudgetPeriod({ ...monthly, period: 'daily' }, now, 10);
    expect(daily.periodStart).toEqual(new Date(2026, 7, 15, 0, 0, 0, 0));

    const yearly = computeBudgetPeriod({ ...monthly, period: 'yearly' }, now, 10);
    expect(yearly.periodStart).toEqual(new Date(2026, 0, 1));
  });

  it('leaves a custom fixed window untouched', () => {
    const custom = {
      period: 'custom',
      startDate: new Date(2026, 2, 3),
      endDate: new Date(2026, 4, 9),
    };
    const { periodStart, periodEnd } = computeBudgetPeriod(custom, new Date(2026, 7, 15), 10);
    expect(periodStart).toEqual(new Date(2026, 2, 3));
    expect(periodEnd).toEqual(new Date(2026, 4, 9));
  });
});
