import type { CashFlowForecastResponse } from '@budget/shared-types';
import { forecastWithOwed, owedTotal } from '../forecastWithOwed';

const base: CashFlowForecastResponse = {
  baseCurrency: 'PLN',
  startBalance: 100,
  typicalDailySpend: 50,
  spendingHistoryShort: false,
  days: [
    { date: '2026-06-10', balance: 100, scheduled: 0 },
    { date: '2026-06-11', balance: 50, scheduled: 0 },
    { date: '2026-06-12', balance: 0, scheduled: 0 },
    { date: '2026-06-13', balance: -50, scheduled: 0 },
  ],
  events: [{ date: '2026-06-12', kind: 'subscription', label: 'Music', amount: -10 }],
  lowest: { date: '2026-06-13', balance: -50 },
  endBalance: -50,
  fxApproximate: false,
  computedAt: '2026-06-10T10:00:00Z',
};

describe('forecastWithOwed', () => {
  it('returns the forecast unchanged when nothing is owed', () => {
    expect(forecastWithOwed(base)).toBe(base);
    expect(forecastWithOwed({ ...base, expectedInflows: [] })).toEqual({ ...base, expectedInflows: [] });
  });

  it('adds each owed amount from its due day onward and recomputes the low and the end', () => {
    const res = forecastWithOwed({
      ...base,
      expectedInflows: [
        { date: '2026-06-11', kind: 'owed', label: 'Anna', amount: 30 },
        { date: '2026-06-13', kind: 'owed', label: 'Bob', amount: 100 },
      ],
    });
    expect(res.days.map((d) => d.balance)).toEqual([100, 80, 30, 80]);
    expect(res.days.map((d) => d.scheduled)).toEqual([0, 30, 0, 100]);
    expect(res.lowest).toEqual({ date: '2026-06-12', balance: 30 });
    expect(res.endBalance).toBe(80);
    expect(res.events.map((e) => e.label)).toEqual(['Anna', 'Music', 'Bob']);
  });

  it('sums what is owed', () => {
    expect(owedTotal(base)).toBe(0);
    expect(
      owedTotal({
        ...base,
        expectedInflows: [
          { date: '2026-06-11', kind: 'owed', label: '', amount: 30.1 },
          { date: '2026-06-13', kind: 'owed', label: '', amount: 0.2 },
        ],
      }),
    ).toBe(30.3);
  });
});
