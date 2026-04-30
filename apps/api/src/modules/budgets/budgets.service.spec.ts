import { computeBudgetPeriod } from './budgets.service';

const fixedNow = new Date('2026-04-30T12:00:00.000Z');

const baseBudget = {
  startDate: new Date('2026-03-01T00:00:00.000Z'),
  endDate: null as Date | null,
};

describe('computeBudgetPeriod', () => {
  it('monthly budget rolls to current calendar month, not since startDate', () => {
    // Reproduces the production bug: monthly budget started 2026-03-01,
    // queried on 2026-04-30 must only cover April, not Mar 1 → Apr 30.
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { ...baseBudget, period: 'monthly' },
      fixedNow,
    );
    expect(periodStart.getFullYear()).toBe(2026);
    expect(periodStart.getMonth()).toBe(3); // April (0-indexed)
    expect(periodStart.getDate()).toBe(1);
    expect(periodEnd.getMonth()).toBe(3);
    expect(periodEnd.getDate()).toBe(30);
  });

  it('weekly budget uses Mon–Sun of the current week', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { ...baseBudget, period: 'weekly' },
      fixedNow,
    );
    expect(periodStart.getDay()).toBe(1); // Monday
    expect(periodEnd.getDay()).toBe(0);   // Sunday
    expect(periodEnd.getTime() - periodStart.getTime()).toBeLessThan(7 * 24 * 60 * 60 * 1000);
  });

  it('daily budget covers the current day only', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { ...baseBudget, period: 'daily' },
      fixedNow,
    );
    expect(periodStart.getDate()).toBe(periodEnd.getDate());
    expect(periodStart.getHours()).toBe(0);
    expect(periodEnd.getHours()).toBe(23);
  });

  it('yearly budget covers Jan 1 – Dec 31 of the current year', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { ...baseBudget, period: 'yearly' },
      fixedNow,
    );
    expect(periodStart.getMonth()).toBe(0);
    expect(periodStart.getDate()).toBe(1);
    expect(periodEnd.getMonth()).toBe(11);
    expect(periodEnd.getDate()).toBe(31);
  });

  it('custom budget keeps its fixed [startDate, endDate] window', () => {
    const start = new Date('2026-01-15T00:00:00.000Z');
    const end = new Date('2026-06-15T00:00:00.000Z');
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { period: 'custom', startDate: start, endDate: end },
      fixedNow,
    );
    expect(periodStart).toBe(start);
    expect(periodEnd).toBe(end);
  });

  it('custom budget without endDate falls back to now', () => {
    const start = new Date('2026-01-15T00:00:00.000Z');
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { period: 'custom', startDate: start, endDate: null },
      fixedNow,
    );
    expect(periodStart).toBe(start);
    expect(periodEnd).toBe(fixedNow);
  });

  it('unknown period falls back to monthly', () => {
    const { periodStart } = computeBudgetPeriod(
      { ...baseBudget, period: 'quarterly' },
      fixedNow,
    );
    expect(periodStart.getDate()).toBe(1);
    expect(periodStart.getMonth()).toBe(3); // April
  });
});
