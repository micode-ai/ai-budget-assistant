import type { GroupSummary } from '@budget/shared-types';

/** Pure logic for the desktop groups table and its summary strip (ABA-646). */

/** Active groups first, then archived; each block by name. Does not mutate its input. */
export function sortGroupsForTable(groups: GroupSummary[]): GroupSummary[] {
  const rank = (g: GroupSummary) => (g.status === 'archived' ? 1 : 0);
  return [...groups].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

export interface CurrencyTotals {
  currencyCode: string;
  /** What I am owed across active groups in this currency (>= 0). */
  owed: number;
  /** What I owe across active groups in this currency (>= 0). */
  owe: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Per-currency owed / owe over ACTIVE groups. Currencies are never blended: a group is denominated
 * in one currency and there is no rate that belongs in a debt between friends. An archived group is
 * excluded (it is read-only history), and a balance inside a cent is "settled" on both sides, as
 * `GroupListRow` and `myPosition` treat it. Currencies sort by code for a stable strip.
 */
export function groupsTotalsByCurrency(groups: GroupSummary[]): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>();
  for (const g of groups) {
    if (g.status === 'archived') continue;
    let t = byCurrency.get(g.currencyCode);
    if (!t) {
      t = { currencyCode: g.currencyCode, owed: 0, owe: 0 };
      byCurrency.set(g.currencyCode, t);
    }
    if (g.myBalance >= 0.01) t.owed += g.myBalance;
    else if (g.myBalance <= -0.01) t.owe += -g.myBalance;
  }
  return [...byCurrency.values()]
    .map((t) => ({ ...t, owed: round2(t.owed), owe: round2(t.owe) }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}
