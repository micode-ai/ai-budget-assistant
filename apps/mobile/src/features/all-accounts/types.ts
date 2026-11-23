import type { useAllAccounts } from './useAllAccounts';
import type { useAccountGroups } from './useAccountGroups';

/** What the platform layouts of the all-accounts screen receive; the hooks are called once in `AllAccountsView`. */
export type AllAccountsState = ReturnType<typeof useAllAccounts>;
export type AccountGroupsState = ReturnType<typeof useAccountGroups>;
