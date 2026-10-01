import type { AccountRole } from '@budget/shared-types';

/**
 * Accounts an expense can be moved into: every account the caller can write
 * to (not a viewer) except the one the expense already lives in. The same
 * rule `app/expense/[id].tsx` applies inline for the phone; the server
 * re-checks membership and role of the TARGET regardless.
 */
export function getMoveTargets<T extends { id: string; myRole: AccountRole }>(
  accounts: T[],
  currentAccountId: string | null,
): T[] {
  return accounts.filter((a) => a.id !== currentAccountId && a.myRole !== 'viewer');
}
