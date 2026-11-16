import type { NetWorthMonth } from '@budget/shared-types';
import { changeSince, isEmptyHistory } from '../netWorthDisplay';

const m = (month: string, net: number): NetWorthMonth => ({
  month, net, cash: net, investments: 0, owedToMe: 0, debts: 0, approximate: false,
});

describe('netWorthDisplay (ABA-799)', () => {
  const history = [m('2026-09', 1000), m('2026-10', 800), m('2026-11', 1200)];

  it('measures the change from an earlier month-end', () => {
    expect(changeSince(history, 1)).toEqual({ amount: 400, percent: 50 });
    expect(changeSince(history, 2)).toEqual({ amount: 200, percent: 20 });
    expect(changeSince(history, 3)).toBeNull();
  });

  it('gives no percent against a zero or negative start', () => {
    expect(changeSince([m('2026-10', -500), m('2026-11', 100)], 1)).toEqual({ amount: 600, percent: null });
  });

  it('knows an empty history', () => {
    expect(isEmptyHistory([m('2026-10', 0)])).toBe(true);
    expect(isEmptyHistory(history)).toBe(false);
  });
});
