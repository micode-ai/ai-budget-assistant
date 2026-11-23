import type { AllAccountsAccountRow } from '@budget/shared-types';
import { changeRatio } from './allAccountsDisplay';

export type AccountSortKey = 'name' | 'spent' | 'income' | 'net' | 'change';
export type SortDir = 'asc' | 'desc';

export interface IndexedAccount {
  account: AllAccountsAccountRow;
  /** Position in the server's list: the account's colour is keyed on it, so a sort must not change it. */
  index: number;
}

function sortValue(a: AllAccountsAccountRow, key: AccountSortKey): number | string | null {
  switch (key) {
    case 'name':
      return a.name.toLowerCase();
    case 'spent':
      return a.spent;
    case 'income':
      return a.income;
    case 'net':
      return a.net;
    case 'change':
      return changeRatio(a.spent, a.prevSpent);
  }
}

/**
 * Sort for the desktop account table. Excluded and encrypted rows carry no figures, so they always sink to the
 * bottom (never sorted as 0), and a missing comparison (`change` with no previous period) sinks below the rest
 * of the counted rows, in either direction.
 */
export function sortAccounts(accounts: AllAccountsAccountRow[], key: AccountSortKey, dir: SortDir): IndexedAccount[] {
  const rows = accounts.map((account, index) => ({ account, index }));
  const sign = dir === 'asc' ? 1 : -1;
  const counted = (r: IndexedAccount) => r.account.included && !r.account.encrypted;
  return rows.sort((x, y) => {
    const cx = counted(x);
    const cy = counted(y);
    if (cx !== cy) return cx ? -1 : 1;
    if (!cx) return x.index - y.index;
    const vx = sortValue(x.account, key);
    const vy = sortValue(y.account, key);
    if (vx === null || vy === null) {
      if (vx === vy) return x.index - y.index;
      return vx === null ? 1 : -1;
    }
    const cmp = typeof vx === 'string' ? vx.localeCompare(vy as string) : vx - (vy as number);
    return cmp !== 0 ? cmp * sign : x.index - y.index;
  });
}
