/**
 * Inflation Shield account attribution and sign-out teardown.
 *
 * Same two defects as `insightsStore.test.ts` documents for Safe-to-Spend (an
 * account-scoped read issued before `currentAccountId` resolved, plus an
 * unkeyed MMKV cache), with a third that was unique to this store: it had no
 * `reset()` at all and was absent from the sign-out teardown, so one person's
 * shopping and price figures survived a sign-out and were read by whoever
 * signed in next on that device.
 *
 * Each test names, in its own comment, the single line whose removal it
 * catches.
 */

// MMKV has no jest-native binding - mock it with an in-memory map. `clearAll`
// is included because `reset()` depends on it.
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
    getInflationShield: jest.fn(),
  },
}));

import { useInflationShieldStore } from '../inflationShieldStore';
import { api } from '@/services/api';

const getInflationShield = jest.mocked(api.getInflationShield);

const ACCOUNT_A = 'acct-family';
const ACCOUNT_B = 'acct-personal';

function shield(savedSoFar: number, canonicalName: string) {
  return {
    baseCurrency: 'PLN',
    items: [
      {
        canonicalName,
        monthlyChangePct: 2.5,
        currentPrice: 8.99,
        projectedPrice: 9.21,
        quantity: 2,
        projectedSaving: 0.44,
        store: 'Biedronka',
        currencyOriginal: 'PLN',
        affordableToday: true,
      },
    ],
    savedSoFar,
    hasEnoughData: true,
    fxApproximate: false,
    computedAt: '2026-07-16T00:00:00Z',
    totalProjectedSaving: 5,
    basketMonthlyForecastPct: 3,
  } as any;
}

const SHIELD_A = shield(12, 'Maslo');
const SHIELD_B = shield(99, 'Chleb');

describe('inflationShieldStore', () => {
  beforeEach(() => {
    getInflationShield.mockReset();
    mockMmkvStore.clear();
    mockCurrentAccountId = null;
    useInflationShieldStore.setState({
      data: null,
      loading: false,
      error: false,
      updatedAt: null,
    });
  });

  describe('load (pre-existing behaviour, preserved)', () => {
    it('populates data and clears loading on success', async () => {
      mockCurrentAccountId = ACCOUNT_A;
      getInflationShield.mockResolvedValue(SHIELD_A);

      await useInflationShieldStore.getState().load();

      const s = useInflationShieldStore.getState();
      expect(s.data?.savedSoFar).toBe(12);
      expect(s.loading).toBe(false);
      expect(s.error).toBe(false);
      expect(typeof s.updatedAt).toBe('number');
    });

    it('keeps this account cached data and sets error on failure (no wipe)', async () => {
      // Unchanged intent from the original suite; the data now has to come from
      // THIS account's cache entry rather than from whatever happened to be in
      // memory, which is the point of the keying.
      mockMmkvStore.set(`shield_data:${ACCOUNT_A}`, JSON.stringify(SHIELD_A));
      mockCurrentAccountId = ACCOUNT_A;
      getInflationShield.mockRejectedValue(new Error('offline'));

      await useInflationShieldStore.getState().load();

      const s = useInflationShieldStore.getState();
      expect(s.data?.savedSoFar).toBe(12); // stale data preserved
      expect(s.error).toBe(true);
      expect(s.loading).toBe(false);
    });
  });

  describe('the race: an account-scoped read must not be issued without an account', () => {
    it('does not call the API at all while currentAccountId is null', async () => {
      // Catches deleting `if (!accountId) { ...; return; }` in load().
      getInflationShield.mockResolvedValue(SHIELD_B);

      await useInflationShieldStore.getState().load();

      expect(getInflationShield).not.toHaveBeenCalled();
      expect(useInflationShieldStore.getState().data).toBeNull();
      expect(useInflationShieldStore.getState().loading).toBe(false);
    });

    it('leaves nothing paintable when the account is unknown, even if figures were on screen', async () => {
      // Catches narrowing the no-account branch to a bare `return` that skips
      // the `set({ data: null, ... })`.
      useInflationShieldStore.setState({ data: SHIELD_A, updatedAt: 1 });

      await useInflationShieldStore.getState().load();

      expect(useInflationShieldStore.getState().data).toBeNull();
      expect(useInflationShieldStore.getState().updatedAt).toBeNull();
    });
  });

  describe('the race: a response that outlives its account must be discarded', () => {
    it('does not paint or cache a response that landed after the account switched away', async () => {
      // Catches deleting the post-await
      // `if (useAccountStore.getState().currentAccountId !== accountId) return;`
      // on the success path.
      mockCurrentAccountId = ACCOUNT_A;
      let settle: (v: unknown) => void = () => {};
      getInflationShield.mockImplementation(
        () =>
          new Promise((r) => {
            settle = r;
          }) as Promise<any>,
      );

      const inFlight = useInflationShieldStore.getState().load();
      mockCurrentAccountId = ACCOUNT_B; // user switches while the request is open
      settle(SHIELD_A);
      await inFlight;

      expect(useInflationShieldStore.getState().data).toBeNull();
      expect(mockMmkvStore.get(`shield_data:${ACCOUNT_A}`)).toBeUndefined();
      expect(mockMmkvStore.get(`shield_data:${ACCOUNT_B}`)).toBeUndefined();
    });

    it('does not overwrite the newer account state when a stale request fails', async () => {
      // Catches deleting the same recheck on the CATCH path.
      mockCurrentAccountId = ACCOUNT_A;
      let fail: (e: unknown) => void = () => {};
      getInflationShield.mockImplementation(
        () =>
          new Promise((_, rej) => {
            fail = rej;
          }) as Promise<any>,
      );

      const inFlight = useInflationShieldStore.getState().load();
      mockCurrentAccountId = ACCOUNT_B;
      useInflationShieldStore.setState({ loading: true, error: false });
      fail(new Error('offline'));
      await inFlight;

      expect(useInflationShieldStore.getState().error).toBe(false);
      expect(useInflationShieldStore.getState().loading).toBe(true);
    });
  });

  describe('the cache is keyed by account', () => {
    it('never paints one account cached figures for another account', async () => {
      // Catches reverting the MMKV keys to bare `shield_data` /
      // `shield_updated_at`.
      mockCurrentAccountId = ACCOUNT_A;
      getInflationShield.mockResolvedValue(SHIELD_A);
      await useInflationShieldStore.getState().load();
      expect(useInflationShieldStore.getState().data?.savedSoFar).toBe(12);

      // Switch to an account with nothing cached, and no network.
      mockCurrentAccountId = ACCOUNT_B;
      getInflationShield.mockRejectedValue(new Error('offline'));
      await useInflationShieldStore.getState().load();

      expect(useInflationShieldStore.getState().data).toBeNull();
    });

    it('paints an account own cached figures immediately, before the network answers', async () => {
      // The positive control: keying must not cost the instant offline paint.
      mockMmkvStore.set(`shield_data:${ACCOUNT_A}`, JSON.stringify(SHIELD_A));
      mockMmkvStore.set(`shield_updated_at:${ACCOUNT_A}`, 1725580800000);
      mockCurrentAccountId = ACCOUNT_A;
      getInflationShield.mockImplementation(() => new Promise(() => {}) as Promise<any>);

      void useInflationShieldStore.getState().load();

      expect(useInflationShieldStore.getState().data?.savedSoFar).toBe(12);
      expect(useInflationShieldStore.getState().updatedAt).toBe(1725580800000);
      expect(useInflationShieldStore.getState().loading).toBe(true);
    });

    it('keeps each account cached side by side, so switching back is still instant', async () => {
      // Catches "clear the cache on switch" as an alternative to keying.
      mockCurrentAccountId = ACCOUNT_A;
      getInflationShield.mockResolvedValue(SHIELD_A);
      await useInflationShieldStore.getState().load();

      mockCurrentAccountId = ACCOUNT_B;
      getInflationShield.mockResolvedValue(SHIELD_B);
      await useInflationShieldStore.getState().load();

      expect(mockMmkvStore.get(`shield_data:${ACCOUNT_A}`)).toBeDefined();
      expect(mockMmkvStore.get(`shield_data:${ACCOUNT_B}`)).toBeDefined();

      mockCurrentAccountId = ACCOUNT_A;
      getInflationShield.mockRejectedValue(new Error('offline'));
      await useInflationShieldStore.getState().load();
      expect(useInflationShieldStore.getState().data?.savedSoFar).toBe(12);
    });
  });

  describe('sign-out teardown', () => {
    it('reset() clears every cached account figure from disk', async () => {
      // Catches deleting `storage.clearAll()` from reset(). This store
      // previously had no reset() at all, so a signed-out device kept one
      // person's shopping and price data for the next person who signed in.
      mockCurrentAccountId = ACCOUNT_A;
      getInflationShield.mockResolvedValue(SHIELD_A);
      await useInflationShieldStore.getState().load();
      expect(mockMmkvStore.size).toBeGreaterThan(0);

      useInflationShieldStore.getState().reset();

      expect(mockMmkvStore.size).toBe(0);
      expect(useInflationShieldStore.getState().data).toBeNull();
      expect(useInflationShieldStore.getState().updatedAt).toBeNull();
    });

    it('a signed-out device cannot repaint the previous user figures', async () => {
      // The end-to-end statement of the privacy defect: cache -> reset -> a
      // fresh load for the SAME account with no network must find nothing.
      mockCurrentAccountId = ACCOUNT_A;
      getInflationShield.mockResolvedValue(SHIELD_A);
      await useInflationShieldStore.getState().load();

      useInflationShieldStore.getState().reset();

      getInflationShield.mockRejectedValue(new Error('offline'));
      await useInflationShieldStore.getState().load();

      expect(useInflationShieldStore.getState().data).toBeNull();
    });
  });
});
