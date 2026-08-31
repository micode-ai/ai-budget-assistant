// Covers authStore.initialize()'s restore-from-credential path (ABA-465): when
// the app starts with NO stored session at all, it should try
// attemptRestoreSession() before giving up and showing the login screen.
//
// Manual factories (not automocks): authStore.ts pulls in every domain store
// at import time, and several of them touch SQLite/MMKV at module scope.
// Mocking each sibling store here keeps this suite hermetic and fast,
// mirroring accountStore.test.ts's approach for its own child dependencies —
// each factory defines ONE state object closed over by `getState()`, so the
// same jest.fn() instance is returned on every call and assertions on it are
// stable across the test.

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
  },
}));

jest.mock('../accountStore', () => {
  const state = {
    loadAccounts: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn(),
  };
  return { useAccountStore: { getState: () => state } };
});

jest.mock('../budgetStore', () => {
  const state = { loadBudgets: jest.fn().mockResolvedValue(undefined), reset: jest.fn() };
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
import { useAccountStore } from '../accountStore';
import { useBudgetStore } from '../budgetStore';
import { useCategoryStore } from '../categoryStore';
import { useWalletStore } from '../walletStore';
import { useExchangeRateStore } from '../exchangeRateStore';
import { hydrateTransactions } from '../hydrateTransactions';
import { attemptRestoreSession } from '../../features/auth/restoreCredential';
import { useFirstRunStore } from '../firstRunStore';

const mockGetItem = secureStorage.getItem as jest.Mock;
const mockSetItem = secureStorage.setItem as jest.Mock;
const mockAttemptRestoreSession = attemptRestoreSession as jest.Mock;
const mockMarkSeen = useFirstRunStore.getState().markSeen as jest.Mock;
const mockLoadAccounts = useAccountStore.getState().loadAccounts as jest.Mock;
const mockAccountInitialize = useAccountStore.getState().initialize as jest.Mock;
const mockLoadRates = useExchangeRateStore.getState().loadRates as jest.Mock;
const mockLoadCategories = useCategoryStore.getState().loadCategories as jest.Mock;
const mockLoadWallet = useWalletStore.getState().loadWallet as jest.Mock;
const mockLoadBudgets = useBudgetStore.getState().loadBudgets as jest.Mock;
const mockHydrateTransactions = hydrateTransactions as jest.Mock;

// The standard, realistic case: the restore endpoint itself refuses an
// unverified account (RestoreCredentialsService), so a real restored session
// always carries isVerified: true. The isVerified: false case (both the
// User.isVerified field and the isAuthenticated gate it drives) gets its own
// dedicated fixture/tests below, distinguishable from this one so neither
// assertion can pass by coincidence on a single wrong implementation.
const RESTORED = {
  accessToken: 'restored-access',
  refreshToken: 'restored-refresh',
  user: {
    id: 'restored-user-id',
    email: 'restored@example.com',
    name: 'Restored User',
    currencyCode: 'USD',
    defaultAccountId: 'acc-1',
    isVerified: true,
  },
  accounts: [{ id: 'acc-1', name: 'Personal' }],
} as any;

function resetAuthState() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isInitializing: true,
    isLoading: false,
    error: null,
    hasSavedSession: false,
  });
}

describe('authStore.initialize — restore from credential (ABA-465)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    resetAuthState();
  });

  it('signs the user in when a restore credential resolves a session', async () => {
    mockAttemptRestoreSession.mockResolvedValue(RESTORED);

    await useAuthStore.getState().initialize();

    expect(mockAttemptRestoreSession).toHaveBeenCalledTimes(1);

    // Tokens and user written to secureStorage.
    expect(mockSetItem).toHaveBeenCalledWith('accessToken', 'restored-access');
    expect(mockSetItem).toHaveBeenCalledWith('refreshToken', 'restored-refresh');
    expect(mockSetItem).toHaveBeenCalledWith('user', expect.stringContaining('"id":"restored-user-id"'));

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.isInitializing).toBe(false);
    expect(state.accessToken).toBe('restored-access');
    expect(state.refreshToken).toBe('restored-refresh');
    expect(state.user?.id).toBe('restored-user-id');
    expect(state.user?.email).toBe('restored@example.com');
    expect(state.user?.isVerified).toBe(true);

    // Established-user signal: onboarding must not show "add your first expense".
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);

    // Lands on a populated app: same data-hydration path the stored-session
    // branch of initialize() runs, not a bare `set`.
    //
    // Account setup uses accountStore.initialize() with the accounts the
    // restore response already carried — NOT loadAccounts(), whose premise
    // (a populated local SQLite) a freshly restored device never satisfies,
    // and which would have fallen through to loadAccountsFromServer() and
    // picked the wrong default account (see the doc comment on
    // applyRestoredSession in authStore.ts).
    expect(mockAccountInitialize).toHaveBeenCalledTimes(1);
    expect(mockAccountInitialize).toHaveBeenCalledWith(
      RESTORED.accounts,
      'acc-1',
      'restored-user-id',
    );
    expect(mockLoadAccounts).not.toHaveBeenCalled();
    expect(mockLoadRates).toHaveBeenCalledTimes(1);
    expect(mockHydrateTransactions).toHaveBeenCalledTimes(1);
    expect(mockLoadCategories).toHaveBeenCalledTimes(1);
    expect(mockLoadWallet).toHaveBeenCalledTimes(1);
    expect(mockLoadBudgets).toHaveBeenCalledTimes(1);
  });

  it('falls back to isVerified: true when the response omits the field', async () => {
    const { isVerified: _omit, ...userWithoutIsVerified } = RESTORED.user;
    mockAttemptRestoreSession.mockResolvedValue({ ...RESTORED, user: userWithoutIsVerified });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().user?.isVerified).toBe(true);
  });

  // Distinct from the two tests above: pins that isAuthenticated is GATED on
  // isVerified (mirroring initialize()'s stored-session branch,
  // `isAuthenticated: !!user.isVerified`), not set unconditionally. A wrong
  // implementation that reads isVerified correctly but still hardcodes
  // isAuthenticated: true would pass the success test above yet fail here.
  it('does not authenticate a restored session that is not verified', async () => {
    mockAttemptRestoreSession.mockResolvedValue({
      ...RESTORED,
      user: { ...RESTORED.user, isVerified: false },
    });

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.user?.isVerified).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    // Boot still completes — an unverified restore must not leave the app
    // stuck on the splash screen, only unauthenticated (routes to verify-email).
    expect(state.isInitializing).toBe(false);
  });

  it('leaves state exactly as before when no restore credential exists', async () => {
    mockAttemptRestoreSession.mockResolvedValue(null);

    await useAuthStore.getState().initialize();

    expect(mockAttemptRestoreSession).toHaveBeenCalledTimes(1);

    const state = useAuthStore.getState();
    expect(state.isInitializing).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.hasSavedSession).toBe(false);

    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockLoadAccounts).not.toHaveBeenCalled();
    expect(mockAccountInitialize).not.toHaveBeenCalled();
    expect(mockHydrateTransactions).not.toHaveBeenCalled();
  });

  it('never calls attemptRestoreSession when a stored session already exists', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return Promise.resolve('stored-access');
      if (key === 'refreshToken') return Promise.resolve('stored-refresh');
      if (key === 'user') {
        return Promise.resolve(JSON.stringify({
          id: 'existing-user-id',
          email: 'existing@example.com',
          name: 'Existing User',
          currencyCode: 'USD',
          timezone: 'UTC',
          isVerified: true,
        }));
      }
      // biometricEnabled and anything else
      return Promise.resolve(null);
    });

    await useAuthStore.getState().initialize();

    // Calling Credential Manager on every launch for an already-signed-in
    // user would be wasted work on the boot path.
    expect(mockAttemptRestoreSession).not.toHaveBeenCalled();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('existing-user-id');
  });
});
