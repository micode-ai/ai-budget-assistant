// Account-scoped reference data must not survive an account switch (ABA-511).
//
// `GET /price-history/products` and `GET /merchant-rules` are both scoped
// server-side to the `X-Account-Id` the client sends, but their stores are
// module-global and were never cleared when that header changed — so account
// B could be shown account A's products and rules. `merchantRulesStore` was
// the worse half: its `isLoaded` flag is a lazy-load guard read by BOTH the
// merchants screen and `notificationCapture/captureService`, and it was never
// reset, so nothing ever re-fetched and a captured bank notification in
// account B could be filed under a category id belonging to account A.
//
// Manual factories (not automocks), same reason as accountStore.test.ts:
// automocking still `require()`s the real module, which pulls in `./client`
// -> expo-sqlite's native `openDatabaseSync`.
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
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    leaveAccount: jest.fn().mockResolvedValue(undefined),
    getAccounts: jest.fn(),
    setAccountIdGetter: jest.fn(),
    listRules: jest.fn().mockResolvedValue([]),
    getProducts: jest.fn().mockResolvedValue([]),
    getPriceHistory: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../services/trip.api', () => ({
  tripApi: { archiveTrip: jest.fn(), updatePaymentInfo: jest.fn() },
}));

import { useAccountStore } from '../accountStore';
import { usePriceHistoryStore } from '../priceHistoryStore';
import { useMerchantRulesStore } from '../merchantRulesStore';
import { api } from '../../services/api';

const account = (id: string) =>
  ({
    id,
    name: id,
    type: 'personal',
    currencyCode: 'USD',
    ownerId: 'user-1',
    isActive: true,
    myRole: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as any;

/** Reference data as it would look after a load under account A. */
function seedAccountAReferenceData() {
  usePriceHistoryStore.setState({
    products: [{ rawName: 'mleko', canonicalName: 'Mleko 1L' }] as any,
    history: { inflationIndex: 4.2 } as any,
    hasAttemptedLoad: true,
  });
  useMerchantRulesStore.setState({
    rules: [
      { id: 'r1', merchantNormalized: 'biedronka', categoryId: 'cat-in-account-a' },
    ] as any,
    isLoaded: true,
  });
}

describe('account switch clears account-scoped reference data (ABA-511)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAccountStore.setState({
      accounts: [account('acc-a'), account('acc-b')],
      currentAccountId: 'acc-a',
      members: {},
      isLoading: false,
      error: null,
    });
    seedAccountAReferenceData();
  });

  // Catches: the missing clear in `switchAccount`. Without it the products
  // screen renders account A's list until (and only if) its own fetch
  // returns — and keeps rendering it forever if that fetch fails offline.
  it('switchAccount clears the price-history products and index', async () => {
    await useAccountStore.getState().switchAccount('acc-b');

    expect(usePriceHistoryStore.getState().products).toEqual([]);
    expect(usePriceHistoryStore.getState().history).toBeNull();
    expect(usePriceHistoryStore.getState().hasAttemptedLoad).toBe(false);
  });

  // Catches: a clear that empties `rules` but leaves `isLoaded` true — the
  // half-fix. Every consumer of this store is guarded by `if (!isLoaded)`,
  // so a clear that does not reset the flag means nothing ever re-fetches
  // and the list stays empty rather than becoming correct.
  it('switchAccount clears the merchant rules AND their isLoaded guard', async () => {
    await useAccountStore.getState().switchAccount('acc-b');

    expect(useMerchantRulesStore.getState().rules).toEqual([]);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(false);
  });

  // The behavioural form of the test above, through the mechanism that
  // matters: `captureService` and the merchants screen both lazily load
  // behind `if (!isLoaded)`. Asserting only "rules are empty" would pass
  // against a half-fix; this fails unless the guard was actually released.
  it('a lazy `if (!isLoaded)` consumer re-fetches rules after a switch', async () => {
    // Before the switch the guard is closed — nothing re-fetches.
    if (!useMerchantRulesStore.getState().isLoaded) {
      await useMerchantRulesStore.getState().loadRules();
    }
    expect(api.listRules).not.toHaveBeenCalled();

    await useAccountStore.getState().switchAccount('acc-b');

    if (!useMerchantRulesStore.getState().isLoaded) {
      await useMerchantRulesStore.getState().loadRules();
    }
    expect(api.listRules).toHaveBeenCalledTimes(1);
  });

  // Catches: an unguarded clear. Re-selecting the account you are already on
  // (the account switcher lists it, and deep links re-assert it) must not
  // wipe caches nothing is going to refill — no consumer effect keyed on
  // `currentAccountId` re-fires when the id did not change, so the screens
  // would be left empty rather than stale.
  it('re-selecting the current account leaves reference data alone', async () => {
    await useAccountStore.getState().switchAccount('acc-a');

    expect(usePriceHistoryStore.getState().products).toHaveLength(1);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(true);
  });

  it('switching to an unknown account id leaves reference data alone', async () => {
    await useAccountStore.getState().switchAccount('acc-missing');

    expect(useAccountStore.getState().currentAccountId).toBe('acc-a');
    expect(usePriceHistoryStore.getState().products).toHaveLength(1);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(true);
  });

  // Deleting or leaving the account you are on moves `currentAccountId` to a
  // different account without going through `switchAccount` — same staleness,
  // same clear.
  it('deleting the current account clears reference data', async () => {
    await useAccountStore.getState().deleteAccount('acc-a');

    expect(usePriceHistoryStore.getState().products).toEqual([]);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(false);
  });

  it('deleting some other account leaves reference data alone', async () => {
    await useAccountStore.getState().deleteAccount('acc-b');

    expect(useAccountStore.getState().currentAccountId).toBe('acc-a');
    expect(usePriceHistoryStore.getState().products).toHaveLength(1);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(true);
  });

  it('leaving the current account clears reference data', async () => {
    await useAccountStore.getState().leaveAccount('acc-a');

    expect(usePriceHistoryStore.getState().products).toEqual([]);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(false);
  });
});

describe('merchantRulesStore.reset (ABA-511)', () => {
  it('clears the rules and reopens the lazy-load guard', () => {
    useMerchantRulesStore.setState({ rules: [{ id: 'r1' }] as any, isLoaded: true });

    useMerchantRulesStore.getState().reset();

    expect(useMerchantRulesStore.getState().rules).toEqual([]);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(false);
  });
});
