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
  const state = { loadCategories: jest.fn().mockResolvedValue(undefined) };
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

jest.mock('../goalStore', () => {
  const state = { reset: jest.fn() };
  return { useGoalStore: { getState: () => state } };
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
});
