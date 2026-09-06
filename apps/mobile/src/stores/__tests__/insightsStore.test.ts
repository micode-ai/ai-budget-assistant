/**
 * Safe-to-Spend account attribution.
 *
 * These tests exist because a measured production defect put ANOTHER account's
 * money on the landing screen as the headline number: the app issued
 * `GET /insights/safe-to-spend` before `accountStore` had resolved
 * `currentAccountId`, so no `X-Account-Id` header went out and the API's
 * `AccountContextGuard` answered for `req.user.defaultAccountId` instead. The
 * result was then cached under an account-less MMKV key and repainted later.
 *
 * Each test below names, in its own comment, the single line whose removal it
 * catches - the race guards and the cache keying are separate defects with
 * separate lines, and a suite that only proved the keying would let the race
 * back in silently.
 */

// MMKV has no jest-native binding - mock it with an in-memory map. `clearAll`
// is included because `reset()` now depends on it (logout must not leave one
// account's figure on disk for the next user).
const mockMmkvStore = new Map<string, string | number>();
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: (k: string) => (mockMmkvStore.has(k) ? String(mockMmkvStore.get(k)) : undefined),
    getNumber: (k: string) =>
      typeof mockMmkvStore.get(k) === 'number' ? (mockMmkvStore.get(k) as number) : undefined,
    set: (k: string, v: string | number) => mockMmkvStore.set(k, v),
    delete: (k: string) => mockMmkvStore.delete(k),
    clearAll: () => mockMmkvStore.clear(),
  })),
}));

let mockCurrentAccountId: string | null = null;
jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccountId: mockCurrentAccountId }) },
}));

jest.mock('@/services/api', () => ({
  api: {
    getSafeToSpend: jest.fn(),
    getAIInsights: jest.fn(),
    getFatFinderReport: jest.fn(),
  },
}));

jest.mock('@/stores/subscriptionStore', () => ({
  useSubscriptionStore: { getState: () => ({ loadUsage: jest.fn() }) },
}));
jest.mock('@/stores/upgradeStore', () => ({
  useUpgradeStore: { getState: () => ({ show: jest.fn() }) },
}));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

import { useInsightsStore } from '../insightsStore';
import { api } from '@/services/api';

const getSafeToSpend = jest.mocked(api.getSafeToSpend);

const ACCOUNT_A = 'acct-family';
const ACCOUNT_B = 'acct-personal';

function response(safeToSpendToday: number, walletBalance: number) {
  return {
    baseCurrency: 'PLN',
    safeToSpendToday,
    projectedAvailable: safeToSpendToday * 10,
    daysRemaining: 10,
    horizonDate: '2026-09-30',
    incomeInferred: true,
    fxApproximate: false,
    breakdown: {
      walletBalance,
      expectedIncome: 0,
      upcomingSubscriptions: 0,
      upcomingRecurring: 0,
      goalContributions: 0,
      buffer: 0,
    },
    computedAt: '2026-09-06T00:00:00Z',
  } as any;
}

// The two figures measured in the browser against the real API: the first is
// what the selected account actually holds, the second is what the header-less
// request returned from the user's default account.
const FAMILY = response(683.41, 17085.18);
const DEFAULT_ACCOUNT = response(0, -10127.07);

function resetStore() {
  useInsightsStore.setState({
    safeToSpend: null,
    safeToSpendLoading: false,
    safeToSpendError: null,
    safeToSpendUpdatedAt: null,
  });
}

describe('insightsStore - safe-to-spend account attribution', () => {
  beforeEach(() => {
    getSafeToSpend.mockReset();
    mockMmkvStore.clear();
    mockCurrentAccountId = null;
    resetStore();
  });

  describe('the race: an account-scoped read must not be issued without an account', () => {
    it('does not call the API at all while currentAccountId is null', async () => {
      // Catches deleting `if (!accountId) { ...; return; }` in loadSafeToSpend.
      // This is the defect exactly as measured: the request went out during the
      // cold-start window and came back describing a different account.
      getSafeToSpend.mockResolvedValue(DEFAULT_ACCOUNT);

      await useInsightsStore.getState().loadSafeToSpend();

      expect(getSafeToSpend).not.toHaveBeenCalled();
      expect(useInsightsStore.getState().safeToSpend).toBeNull();
      expect(useInsightsStore.getState().safeToSpendLoading).toBe(false);
    });

    it('leaves nothing paintable when the account is unknown, even if a figure was on screen', async () => {
      // Catches narrowing the no-account branch to a bare `return` that skips
      // the `set({ safeToSpend: null })`. Switching to an unresolved account
      // must clear the figure, not strand the previous account's on screen.
      useInsightsStore.setState({ safeToSpend: FAMILY, safeToSpendUpdatedAt: 1 });

      await useInsightsStore.getState().loadSafeToSpend();

      expect(useInsightsStore.getState().safeToSpend).toBeNull();
      expect(useInsightsStore.getState().safeToSpendUpdatedAt).toBeNull();
    });

    it('issues the read and paints it once an account is resolved', async () => {
      // The positive control: the guard must suppress the request, not the
      // feature. Catches a guard that never lets go.
      mockCurrentAccountId = ACCOUNT_A;
      getSafeToSpend.mockResolvedValue(FAMILY);

      await useInsightsStore.getState().loadSafeToSpend();

      expect(getSafeToSpend).toHaveBeenCalledTimes(1);
      expect(useInsightsStore.getState().safeToSpend?.safeToSpendToday).toBe(683.41);
      expect(useInsightsStore.getState().safeToSpendLoading).toBe(false);
    });
  });

  describe('the race: a response that outlives its account must be discarded', () => {
    it('does not paint a response that landed after the account switched away', async () => {
      // Catches deleting the post-await
      // `if (useAccountStore.getState().currentAccountId !== accountId) return;`
      // on the success path. The `X-Account-Id` header is read mid-request
      // (after `await getAuthToken()`), so a switch during the call means we
      // cannot prove which account answered.
      mockCurrentAccountId = ACCOUNT_A;
      let settle: (v: unknown) => void = () => {};
      getSafeToSpend.mockImplementation(
        () =>
          new Promise((r) => {
            settle = r;
          }) as Promise<any>,
      );

      const inFlight = useInsightsStore.getState().loadSafeToSpend();
      mockCurrentAccountId = ACCOUNT_B; // user switches while the request is open
      settle(FAMILY);
      await inFlight;

      expect(useInsightsStore.getState().safeToSpend).toBeNull();
    });

    it('does not cache a response that landed after the account switched away', async () => {
      // Same deleted line as above, observed on disk rather than on screen: a
      // wrongly-attributed value written to MMKV outlives the session and is
      // repainted on the next cold start.
      mockCurrentAccountId = ACCOUNT_A;
      let settle: (v: unknown) => void = () => {};
      getSafeToSpend.mockImplementation(
        () =>
          new Promise((r) => {
            settle = r;
          }) as Promise<any>,
      );

      const inFlight = useInsightsStore.getState().loadSafeToSpend();
      mockCurrentAccountId = ACCOUNT_B;
      settle(FAMILY);
      await inFlight;

      expect(mockMmkvStore.get(`sts_data:${ACCOUNT_A}`)).toBeUndefined();
      expect(mockMmkvStore.get(`sts_data:${ACCOUNT_B}`)).toBeUndefined();
    });

    it('does not overwrite the newer account state when a stale request fails', async () => {
      // Catches deleting the same recheck on the CATCH path. A stale rejection
      // must not stamp an error over the load the switch already started.
      mockCurrentAccountId = ACCOUNT_A;
      let fail: (e: unknown) => void = () => {};
      getSafeToSpend.mockImplementation(
        () =>
          new Promise((_, rej) => {
            fail = rej;
          }) as Promise<any>,
      );

      const inFlight = useInsightsStore.getState().loadSafeToSpend();
      mockCurrentAccountId = ACCOUNT_B;
      useInsightsStore.setState({ safeToSpendLoading: true, safeToSpendError: null });
      fail(new Error('offline'));
      await inFlight;

      expect(useInsightsStore.getState().safeToSpendError).toBeNull();
      expect(useInsightsStore.getState().safeToSpendLoading).toBe(true);
    });
  });

  describe('the cache is keyed by account', () => {
    it('never paints one account cached figure for another account', async () => {
      // Catches reverting the MMKV keys to bare `sts_data` / `sts_updated_at`.
      // With unkeyed writes, account A's figure is what account B reads on its
      // instant offline paint.
      mockCurrentAccountId = ACCOUNT_A;
      getSafeToSpend.mockResolvedValue(FAMILY);
      await useInsightsStore.getState().loadSafeToSpend();
      expect(useInsightsStore.getState().safeToSpend?.safeToSpendToday).toBe(683.41);

      // Switch to an account with nothing cached, and no network.
      mockCurrentAccountId = ACCOUNT_B;
      getSafeToSpend.mockRejectedValue(new Error('offline'));
      await useInsightsStore.getState().loadSafeToSpend();

      expect(useInsightsStore.getState().safeToSpend).toBeNull();
    });

    it('paints an account own cached figure immediately, before the network answers', async () => {
      // The positive control for keying: the cache still exists to paint
      // instantly offline. Catches "fixing" the race by deleting the cache read.
      mockMmkvStore.set(`sts_data:${ACCOUNT_A}`, JSON.stringify(FAMILY));
      mockMmkvStore.set(`sts_updated_at:${ACCOUNT_A}`, 1725580800000);
      mockCurrentAccountId = ACCOUNT_A;
      getSafeToSpend.mockImplementation(() => new Promise(() => {}) as Promise<any>);

      void useInsightsStore.getState().loadSafeToSpend();

      // Synchronously after the call, with the request still open.
      expect(useInsightsStore.getState().safeToSpend?.safeToSpendToday).toBe(683.41);
      expect(useInsightsStore.getState().safeToSpendUpdatedAt).toBe(1725580800000);
      expect(useInsightsStore.getState().safeToSpendLoading).toBe(true);
    });

    it('keeps each account cached side by side, so switching back is still instant', async () => {
      // Catches "clear the cache on switch" as an alternative to keying: it
      // would satisfy the leak tests while destroying the offline paint for the
      // account the user switches back to.
      mockCurrentAccountId = ACCOUNT_A;
      getSafeToSpend.mockResolvedValue(FAMILY);
      await useInsightsStore.getState().loadSafeToSpend();

      mockCurrentAccountId = ACCOUNT_B;
      getSafeToSpend.mockResolvedValue(DEFAULT_ACCOUNT);
      await useInsightsStore.getState().loadSafeToSpend();

      expect(mockMmkvStore.get(`sts_data:${ACCOUNT_A}`)).toBeDefined();
      expect(mockMmkvStore.get(`sts_data:${ACCOUNT_B}`)).toBeDefined();

      mockCurrentAccountId = ACCOUNT_A;
      getSafeToSpend.mockRejectedValue(new Error('offline'));
      await useInsightsStore.getState().loadSafeToSpend();
      expect(useInsightsStore.getState().safeToSpend?.safeToSpendToday).toBe(683.41);
    });

    it('keeps this account cached figure when the network fails', async () => {
      // Pre-existing behaviour the keying must not regress: an offline reload
      // shows the last known figure for THIS account rather than blanking.
      mockMmkvStore.set(`sts_data:${ACCOUNT_A}`, JSON.stringify(FAMILY));
      mockCurrentAccountId = ACCOUNT_A;
      getSafeToSpend.mockRejectedValue(new Error('offline'));

      await useInsightsStore.getState().loadSafeToSpend();

      expect(useInsightsStore.getState().safeToSpend?.safeToSpendToday).toBe(683.41);
      expect(useInsightsStore.getState().safeToSpendError).toBe('offline');
    });
  });

  describe('logout', () => {
    it('clears every cached account figure from disk', async () => {
      // Catches deleting `stsStorage.clearAll()` from reset(). Keying alone
      // stops cross-ACCOUNT bleed; without this, a figure still outlives the
      // session that produced it and greets the next USER on this device.
      mockCurrentAccountId = ACCOUNT_A;
      getSafeToSpend.mockResolvedValue(FAMILY);
      await useInsightsStore.getState().loadSafeToSpend();
      expect(mockMmkvStore.size).toBeGreaterThan(0);

      useInsightsStore.getState().reset();

      expect(mockMmkvStore.size).toBe(0);
      expect(useInsightsStore.getState().safeToSpend).toBeNull();
    });
  });
});
