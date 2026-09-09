// Covers authStore.logout()'s restore-credential cleanup (ABA-465): sign-out
// must stop the device offering a Credential Manager passkey, or a
// signed-out phone would silently sign itself back in on a later launch.
//
// Manual factories (not automocks), same reason and pattern as
// authStoreRestore.test.ts: authStore.ts pulls in every domain store at
// import time, and several of them touch SQLite/MMKV at module scope.

jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/api', () => ({
  api: {
    setLogoutHandler: jest.fn(),
    deleteRestoreCredentials: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/notifications', () => ({
  unregisterPushNotifications: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/restoreCredentials', () => ({
  clearRestoreCredential: jest.fn().mockResolvedValue(undefined),
  isRestoreCredentialAvailable: jest.fn().mockReturnValue(true),
}));

jest.mock('../accountStore', () => {
  const state = { reset: jest.fn() };
  return { useAccountStore: { getState: () => state } };
});

jest.mock('../budgetStore', () => {
  const state = { reset: jest.fn() };
  return { useBudgetStore: { getState: () => state } };
});

jest.mock('../expenseStore', () => {
  const state = { reset: jest.fn() };
  return { useExpenseStore: { getState: () => state } };
});

jest.mock('../incomeStore', () => {
  const state = { reset: jest.fn() };
  return { useIncomeStore: { getState: () => state } };
});

jest.mock('../hydrateTransactions', () => ({
  hydrateTransactions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../categoryStore', () => {
  const state = { loadCategories: jest.fn().mockResolvedValue(undefined), reset: jest.fn() };
  return { useCategoryStore: { getState: () => state } };
});

jest.mock('../walletStore', () => {
  const state = { loadWallet: jest.fn().mockResolvedValue(undefined), reset: jest.fn() };
  return { useWalletStore: { getState: () => state } };
});

jest.mock('../exchangeRateStore', () => {
  const state = { loadRates: jest.fn().mockResolvedValue(undefined), reset: jest.fn() };
  return { useExchangeRateStore: { getState: () => state } };
});

jest.mock('../investmentStore', () => {
  const state = { reset: jest.fn() };
  return { useInvestmentStore: { getState: () => state } };
});

jest.mock('../insightsStore', () => {
  const state = { reset: jest.fn() };
  return { useInsightsStore: { getState: () => state } };
});

jest.mock('../inflationShieldStore', () => {
  const state = { reset: jest.fn() };
  return { useInflationShieldStore: { getState: () => state } };
});

jest.mock('../goalStore', () => {
  const state = { reset: jest.fn() };
  return { useGoalStore: { getState: () => state } };
});

jest.mock('../priceHistoryStore', () => {
  const state = { reset: jest.fn() };
  return { usePriceHistoryStore: { getState: () => state } };
});

jest.mock('../merchantRulesStore', () => {
  const state = { reset: jest.fn() };
  return { useMerchantRulesStore: { getState: () => state } };
});

jest.mock('../chatStore', () => {
  const state = { reset: jest.fn() };
  return { useChatStore: { getState: () => state } };
});

jest.mock('../../db/investmentRepository', () => ({
  clearAllInvestments: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/currency', () => ({
  applyCurrencyChange: jest.fn(),
}));

jest.mock('../../utils/paymentInfo', () => ({
  applyPaymentInfoPatch: jest.fn(),
  applyPaymentMethodsPatch: jest.fn(),
}));

jest.mock('../../features/auth/restoreCredential', () => ({
  registerRestoreCredential: jest.fn(),
  attemptRestoreSession: jest.fn(),
}));

jest.mock('../firstRunStore', () => {
  const state = { markSeen: jest.fn() };
  return { useFirstRunStore: { getState: () => state } };
});

import { useAuthStore } from '../authStore';
import { useInflationShieldStore } from '../inflationShieldStore';
import { usePriceHistoryStore } from '../priceHistoryStore';
import { useMerchantRulesStore } from '../merchantRulesStore';
import { useChatStore } from '../chatStore';
import { secureStorage } from '../../services/secureStorage';
import { api } from '../../services/api';
import { unregisterPushNotifications } from '../../services/notifications';
import { clearRestoreCredential, isRestoreCredentialAvailable } from '../../services/restoreCredentials';

const mockGetItem = secureStorage.getItem as jest.Mock;
const mockDeleteRestoreCredentials = api.deleteRestoreCredentials as jest.Mock;
const mockUnregisterPush = unregisterPushNotifications as jest.Mock;
const mockClearRestoreCredential = clearRestoreCredential as jest.Mock;
const mockIsAvailable = isRestoreCredentialAvailable as jest.Mock;

describe('authStore.logout — restore credential cleanup (ABA-465)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockDeleteRestoreCredentials.mockResolvedValue(undefined);
    mockUnregisterPush.mockResolvedValue(undefined);
    mockClearRestoreCredential.mockResolvedValue(undefined);
    // Most of this file exercises the "bridge is available" (Android) path —
    // only the dedicated test below flips this to false.
    mockIsAvailable.mockReturnValue(true);
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isInitializing: false,
      isLoading: false,
      error: null,
      hasSavedSession: false,
    });
  });

  it('deletes the server-side restore credential and clears the local one when a valid access token exists', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return Promise.resolve('valid-access-token');
      return Promise.resolve(null);
    });

    await useAuthStore.getState().logout();

    expect(mockDeleteRestoreCredentials).toHaveBeenCalledTimes(1);
    expect(mockClearRestoreCredential).toHaveBeenCalledTimes(1);
  });

  // The one behavior whose regression would be silent and harmful: logout is
  // also reached from a 401 cascade where the tokens are already gone (see
  // unregisterPushNotifications above it, guarded the same way). Calling an
  // authenticated endpoint with no token would 401, and a 401 on this client
  // can itself trigger refresh-then-logout — so the server call must be
  // skipped, not merely tolerated, when there is no valid token. The local
  // clear must still run: a device with no valid access token can still hold
  // a Credential Manager passkey from an earlier session.
  it('skips the server delete but still clears the local credential when there is no valid access token', async () => {
    mockGetItem.mockResolvedValue(null); // no accessToken in secureStorage

    await useAuthStore.getState().logout();

    expect(mockDeleteRestoreCredentials).not.toHaveBeenCalled();
    expect(mockClearRestoreCredential).toHaveBeenCalledTimes(1);
  });

  // iOS/web (and an Android build with no registered native module) can
  // never have a server-side row — this device could never have registered
  // one — so calling deleteRestoreCredentials there would hit the server on
  // every sign-out for nothing, the same defect class the availability gate
  // on registerRestoreCredential/attemptRestoreSession already closes.
  // clearRestoreCredential() is deliberately NOT gated the same way — it is
  // a local no-op on those platforms, so gating it buys nothing.
  it('skips the server delete when the restore-credential bridge is unavailable, but still clears locally', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return Promise.resolve('valid-access-token');
      return Promise.resolve(null);
    });
    mockIsAvailable.mockReturnValue(false);

    await useAuthStore.getState().logout();

    expect(mockDeleteRestoreCredentials).not.toHaveBeenCalled();
    expect(mockClearRestoreCredential).toHaveBeenCalledTimes(1);
  });

  it('does not let a server delete failure stop the local credential from being cleared or abort logout', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return Promise.resolve('valid-access-token');
      return Promise.resolve(null);
    });
    mockDeleteRestoreCredentials.mockRejectedValue(new Error('network down'));

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();

    expect(mockClearRestoreCredential).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  // The inflation-shield cache is MMKV-backed and, unlike every other store in
  // this teardown list, was never reset on sign-out at all - the store had no
  // reset() to call. Its cache therefore survived sign-out and was read by
  // whoever signed in NEXT on that device: one person's shopping and price
  // figures shown to another person on a shared or public machine. This test
  // catches deleting `useInflationShieldStore.getState().reset()` from the
  // teardown block in authSessionActions.ts - the store owning a working
  // reset() is only half the fix if nothing calls it.
  it('resets the inflation-shield cache on sign-out', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return Promise.resolve('valid-access-token');
      return Promise.resolve(null);
    });

    await useAuthStore.getState().logout();

    expect(useInflationShieldStore.getState().reset).toHaveBeenCalledTimes(1);
  });

  // Sign-out is also reached from a 401 cascade with the tokens already gone.
  // The teardown must not be conditional on a valid token: a device with no
  // usable session can still hold a full MMKV cache from the session before.
  it('resets the inflation-shield cache even when there is no valid access token', async () => {
    mockGetItem.mockResolvedValue(null);

    await useAuthStore.getState().logout();

    expect(useInflationShieldStore.getState().reset).toHaveBeenCalledTimes(1);
  });

  // Same defect class one row down the list (ABA-511): both of these hold data
  // the server scopes per account, and neither was in this teardown block, so
  // signing in as somebody else on the same device showed the previous user's
  // products and merchant rules. `merchantRulesStore` was the worse of the
  // two - its `isLoaded` flag is a lazy-load guard, so nothing would have
  // re-fetched for the new user either.
  it('resets the account-scoped reference-data caches on sign-out', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return Promise.resolve('valid-access-token');
      return Promise.resolve(null);
    });

    await useAuthStore.getState().logout();

    expect(usePriceHistoryStore.getState().reset).toHaveBeenCalledTimes(1);
    expect(useMerchantRulesStore.getState().reset).toHaveBeenCalledTimes(1);
  });

  // ABA-513: `chatStore` had no `reset()` at all and was absent from this
  // teardown block, so a conversation list (and its messages — which can
  // carry another person's name, amounts, anything typed to the assistant)
  // survived sign-out and was readable by the next person to sign in on the
  // same device or browser. Same class of finding as the inflation-shield
  // cache above.
  it('resets the chat conversation cache on sign-out', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return Promise.resolve('valid-access-token');
      return Promise.resolve(null);
    });

    await useAuthStore.getState().logout();

    expect(useChatStore.getState().reset).toHaveBeenCalledTimes(1);
  });

  // Sign-out is also reached from a 401 cascade with the tokens already gone.
  // The teardown must not be conditional on a valid token: a device with no
  // usable session can still hold a chat cache from the session before.
  it('resets the chat conversation cache even when there is no valid access token', async () => {
    mockGetItem.mockResolvedValue(null);

    await useAuthStore.getState().logout();

    expect(useChatStore.getState().reset).toHaveBeenCalledTimes(1);
  });
});
