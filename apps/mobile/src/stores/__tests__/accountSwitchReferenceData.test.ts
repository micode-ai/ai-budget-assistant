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

// Same reason as the other manual db factories above: `chatStore.ts` (pulled
// in transitively now that `clearAccountScopedCaches` resets it) imports
// `@/db/chatRepository`, which imports `./client` -> expo-sqlite. None of
// these are called by the tests below (they seed `useChatStore` directly via
// `setState`), but the module still has to resolve.
jest.mock('../categoryStore', () => {
  // `accountStore` imports this for `clearAccountScopedCaches`; the real module
  // pulls in `authStore`, which wires the api client at module scope.
  const state = { loadCategories: jest.fn().mockResolvedValue(undefined), reset: jest.fn() };
  return { useCategoryStore: { getState: () => state } };
});

jest.mock('../../db/chatRepository', () => ({
  getConversations: jest.fn().mockResolvedValue([]),
  upsertConversation: jest.fn().mockResolvedValue(undefined),
  getMessages: jest.fn().mockResolvedValue([]),
  upsertMessage: jest.fn().mockResolvedValue(undefined),
}));

import { useAccountStore } from '../accountStore';
import { loadAllAccounts } from '../../db/accountRepository';
import { secureStorage } from '../../services/secureStorage';
import { usePriceHistoryStore } from '../priceHistoryStore';
import { useMerchantRulesStore } from '../merchantRulesStore';
import { useChatStore } from '../chatStore';
import { useCategoryStore } from '../categoryStore';
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
    (loadAllAccounts as jest.Mock).mockResolvedValue([]);
    (secureStorage.getItem as jest.Mock).mockResolvedValue(null);
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

  // The fourth path, and the one nobody chooses: both list-loading actions
  // silently fall back to `localAccounts[0]` when the selection is no longer
  // in the list, which is exactly the moment a user is moved to a different
  // account without asking - a membership removed elsewhere, or an account
  // deleted on another device.
  it('loadAccountsFromServer clears when the selection is gone from the server list', async () => {
    (api.getAccounts as jest.Mock).mockResolvedValue([{ id: 'acc-b', name: 'acc-b' }]);
    (loadAllAccounts as jest.Mock).mockResolvedValue([account('acc-b')]);

    await useAccountStore.getState().loadAccountsFromServer();

    expect(useAccountStore.getState().currentAccountId).toBe('acc-b');
    expect(usePriceHistoryStore.getState().products).toEqual([]);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(false);
  });

  it('loadAccounts clears when the persisted selection is gone from the local list', async () => {
    (loadAllAccounts as jest.Mock).mockResolvedValue([account('acc-b')]);
    (secureStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'currentAccountId' ? 'acc-a' : null),
    );
    // `loadAccounts` ends with a fire-and-forget `loadAccountsFromServer()`;
    // rejecting keeps that background call from racing the assertions with a
    // second selection change.
    (api.getAccounts as jest.Mock).mockRejectedValue(new Error('offline'));

    await useAccountStore.getState().loadAccounts();

    expect(useAccountStore.getState().currentAccountId).toBe('acc-b');
    expect(usePriceHistoryStore.getState().products).toEqual([]);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(false);
  });

  // The teardown is attached to the field, not to the actions that assign it.
  // This is the test that keeps a NINTH writer of `currentAccountId` safe, and
  // it is the one that fails if the clear is ever moved back into the
  // individual actions - which is how three of the eight existing writers came
  // to be missed in the first place.
  it('clears for any writer of currentAccountId, not just the actions that were remembered', () => {
    useAccountStore.setState({ currentAccountId: 'acc-b' });

    expect(usePriceHistoryStore.getState().products).toEqual([]);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(false);
  });

  // Nothing was addressed under a real account before, so there is nothing
  // belonging to one to throw away; sign-out has its own teardown block in
  // `logoutAction`. Without this guard every cold start would clear.
  it('does not clear when the selection is set for the first time', () => {
    useAccountStore.setState({ currentAccountId: null });
    seedAccountAReferenceData();

    useAccountStore.setState({ currentAccountId: 'acc-b' });

    expect(usePriceHistoryStore.getState().products).toHaveLength(1);
    expect(useMerchantRulesStore.getState().isLoaded).toBe(true);
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

// ABA-513: a `ChatConversation` belongs to one account (its `accountId`), the
// same as the price-history/merchant-rules data above, but `chatStore` was
// never wired into `clearAccountScopedCaches()` at all — an account switch
// left the previous account's conversation list, transcript and
// `currentConversationId` on screen, with a composer that would still post
// into the account just switched away from.
describe('account switch clears the chat conversation cache (ABA-513)', () => {
  function seedAccountAChatData() {
    useChatStore.setState({
      conversations: [{ id: 'conv-a', isShared: false } as any],
      currentConversationId: 'conv-a',
      messages: [{ id: 'm1', role: 'user', content: 'account A secret', createdAt: new Date() }],
      isLoading: true,
      isConfirming: true,
      error: 'stale error',
      currentIsShared: true,
      currentIsOwner: false,
      ownedConversationIds: ['conv-a'],
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      isPolling: true,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (loadAllAccounts as jest.Mock).mockResolvedValue([]);
    (secureStorage.getItem as jest.Mock).mockResolvedValue(null);
    useAccountStore.setState({
      accounts: [account('acc-a'), account('acc-b')],
      currentAccountId: 'acc-a',
      members: {},
      isLoading: false,
      error: null,
    });
    seedAccountAChatData();
  });

  // Catches: `chatStore` staying absent from `clearAccountScopedCaches()`.
  // Without this, `conversations`/`messages`/`currentConversationId` are still
  // account A's after the switch resolves.
  it('switchAccount clears the conversation list, current conversation and transcript', async () => {
    await useAccountStore.getState().switchAccount('acc-b');

    expect(useChatStore.getState().conversations).toEqual([]);
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().currentConversationId).toBeNull();
    expect(useChatStore.getState().currentIsShared).toBe(false);
    expect(useChatStore.getState().currentIsOwner).toBe(true);
    expect(useChatStore.getState().ownedConversationIds).toEqual([]);
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().isConfirming).toBe(false);
    expect(useChatStore.getState().error).toBeNull();
    expect(useChatStore.getState().lastSyncedAt).toBeNull();
    expect(useChatStore.getState().isPolling).toBe(false);
  });

  // The interesting case. A fix that only re-triggers a reload (e.g. calling
  // `loadConversations()` instead of `reset()` from the account-switch
  // subscription) would make the test above pass once its promise settles,
  // while the stale conversation and transcript are still rendered for
  // however long that network round trip takes — the exact defect class
  // wave 4 found for `tagStore`/`projectStore`. The subscription in
  // `accountStore.ts` fires synchronously inside `set()`, and the synchronous
  // prefix of an `async` function runs immediately when it is called, before
  // the caller awaits anything — so if the clear is real, account A's
  // messages must already be gone the instant `switchAccount` is invoked,
  // not merely by the time its promise resolves.
  it('clears synchronously with the switch — a stale transcript must never be visible while a reload would still be in flight', () => {
    const resetSpy = jest.spyOn(useChatStore.getState(), 'reset');

    const pending = useAccountStore.getState().switchAccount('acc-b');

    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().conversations).toEqual([]);

    return pending;
  });

  // Mirrors the reference-data suite above: re-selecting the account you are
  // already on must not wipe a conversation nothing is going to refill — no
  // `[currentAccountId]` effect re-fires when the id did not change.
  it('re-selecting the current account leaves the chat cache alone', async () => {
    await useAccountStore.getState().switchAccount('acc-a');

    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().currentConversationId).toBe('conv-a');
  });

  // Catches: categories left out of `clearAccountScopedCaches`. They are
  // account-scoped (`getAllCategories(accountId)`, `GET /categories` under
  // `X-Account-Id`), so account A's names would otherwise keep rendering
  // under account B until B's own fetch returned — and forever if it failed.
  it('clears the category cache too', async () => {
    await useAccountStore.getState().switchAccount('acc-b');

    expect(useCategoryStore.getState().reset).toHaveBeenCalled();
  });
});
