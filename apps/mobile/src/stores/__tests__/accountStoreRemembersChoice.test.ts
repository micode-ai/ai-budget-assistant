import { useAccountStore, lastAccountKey } from '../accountStore';
import { secureStorage } from '../../services/secureStorage';

/**
 * Signing out and back in must land you on the account you were last using,
 * not on your default one.
 *
 * ## The bug this pins
 *
 * `logoutAction` deliberately removes the live `currentAccountId` — on a shared
 * browser the next person must not inherit it — and `initialize` computed
 * `defaultAccountId || accounts[0]` without ever consulting a remembered
 * choice. So the selection was lost by construction on every sign-out, in an
 * app where every screen is account-scoped.
 *
 * The fix is not to stop clearing on logout: it is to remember the choice
 * PER USER, so the same person gets their account back and a different person
 * gets their own default. Hence a `lastAccountId:<userId>` key rather than one
 * shared slot.
 *
 * Every case below is a way the remembered value can be wrong, and each must
 * fall back rather than strand the user somewhere they cannot use:
 * a remembered account they have since left, a value belonging to a different
 * user, and nothing remembered at all.
 */

jest.mock('../../db/accountRepository', () => ({
  loadAllAccounts: jest.fn().mockResolvedValue([]),
  insertAccounts: jest.fn().mockResolvedValue(undefined),
  updateAccountInDb: jest.fn().mockResolvedValue(undefined),
  deleteAccountFromDb: jest.fn().mockResolvedValue(undefined),
  insertAccount: jest.fn().mockResolvedValue(undefined),
  loadMembersByAccountId: jest.fn().mockResolvedValue([]),
  insertMembers: jest.fn().mockResolvedValue(undefined),
  deleteMembersByAccountId: jest.fn().mockResolvedValue(undefined),
  clearAllAccounts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/expenseRepository', () => ({
  clearAllExpenses: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../db/walletRepository', () => ({
  clearAllWalletBalances: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../db/currencyExchangeRepository', () => ({
  clearAllExchanges: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/api', () => ({
  api: {
    createAccount: jest.fn(),
    updateAccount: jest.fn(),
    deleteAccount: jest.fn(),
    getAccounts: jest.fn(),
    setAccountIdGetter: jest.fn(),
  },
}));

jest.mock('../categoryStore', () => {
  // `accountStore` imports this store for `clearAccountScopedCaches`; the real
  // module pulls in `authStore`, which wires the api client at module scope.
  const state = { loadCategories: jest.fn().mockResolvedValue(undefined), reset: jest.fn() };
  return { useCategoryStore: { getState: () => state } };
});

jest.mock('../../services/trip.api', () => ({
  tripApi: { archiveTrip: jest.fn(), updatePaymentInfo: jest.fn() },
}));

const getItem = secureStorage.getItem as jest.Mock;
const setItem = secureStorage.setItem as jest.Mock;

const USER = 'user-1';
const PERSONAL = 'acc-personal';
const FAMILY = 'acc-family';

const accounts = [
  { id: PERSONAL, name: 'Personal', type: 'personal', myRole: 'owner' },
  { id: FAMILY, name: 'Family', type: 'shared', myRole: 'editor' },
] as never[];

/** Answers only the per-user key, exactly as a real store would. */
function remember(userId: string, accountId: string) {
  getItem.mockImplementation(async (k: string) =>
    k === lastAccountKey(userId) ? accountId : null,
  );
}

describe('accountStore remembers the last used account per user', () => {
  beforeEach(() => {
    getItem.mockReset().mockResolvedValue(null);
    setItem.mockReset().mockResolvedValue(undefined);
    useAccountStore.setState({ accounts: [], currentAccountId: null } as never);
  });

  it('restores the remembered account instead of the default one', async () => {
    remember(USER, FAMILY);

    await useAccountStore.getState().initialize(accounts, PERSONAL, USER);

    expect(useAccountStore.getState().currentAccountId).toBe(FAMILY);
  });

  it('falls back to the default when the remembered account is no longer in the list', async () => {
    // Left the account, or it was deleted. Selecting it would scope every
    // screen to something the API will refuse.
    remember(USER, 'acc-long-gone');

    await useAccountStore.getState().initialize(accounts, PERSONAL, USER);

    expect(useAccountStore.getState().currentAccountId).toBe(PERSONAL);
  });

  it('ignores another user’s remembered account', async () => {
    // The whole reason the key is per user: a shared browser must not hand
    // one person's selection to the next.
    remember('someone-else', FAMILY);

    await useAccountStore.getState().initialize(accounts, PERSONAL, USER);

    expect(useAccountStore.getState().currentAccountId).toBe(PERSONAL);
  });

  it('falls back to the default when nothing is remembered', async () => {
    await useAccountStore.getState().initialize(accounts, PERSONAL, USER);

    expect(useAccountStore.getState().currentAccountId).toBe(PERSONAL);
  });

  it('remembers the choice when the user switches account', async () => {
    useAccountStore.setState({ accounts, currentAccountId: PERSONAL } as never);
    // The store resolves the user from the stored `user` JSON, the same way
    // every other method in it does.
    getItem.mockImplementation(async (k: string) =>
      k === 'user' ? JSON.stringify({ id: USER }) : null,
    );

    await useAccountStore.getState().switchAccount(FAMILY);

    expect(setItem).toHaveBeenCalledWith(lastAccountKey(USER), FAMILY);
    // The live pointer is still written too — logout clears that one, and it is
    // what every account-scoped request reads.
    expect(setItem).toHaveBeenCalledWith('currentAccountId', FAMILY);
  });

  it('records the choice initialize made, so the next sign-in is stable', async () => {
    // Without this the very first session after sign-up remembers nothing, and
    // a user who never touches the switcher keeps re-deriving their default.
    await useAccountStore.getState().initialize(accounts, PERSONAL, USER);

    expect(setItem).toHaveBeenCalledWith(lastAccountKey(USER), PERSONAL);
  });
});
