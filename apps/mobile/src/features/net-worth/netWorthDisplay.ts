import type { NetWorthMonth } from '@budget/shared-types';

export interface NetWorthChange {
  amount: number;
  /** Percent of the earlier figure; null when that was zero or negative (a percent of a debt misleads). */
  percent: number | null;
}

/** Change from the month-end `monthsBack` entries before the last one (ABA-799). */
export function changeSince(history: NetWorthMonth[], monthsBack: number): NetWorthChange | null {
  if (history.length <= monthsBack) return null;
  const now = history[history.length - 1].net;
  const then = history[history.length - 1 - monthsBack].net;
  const amount = Math.round((now - then) * 100) / 100;
  return { amount, percent: then > 0 ? Math.round((amount / then) * 1000) / 10 : null };
}

/** True while every month is zero — a new user with nothing recorded yet. */
export function isEmptyHistory(history: NetWorthMonth[]): boolean {
  return history.every((h) => h.cash === 0 && h.investments === 0 && h.owedToMe === 0 && h.debts === 0);
}
