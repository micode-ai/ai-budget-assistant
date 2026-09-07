import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { api } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUpgradeStore } from '@/stores/upgradeStore';
import i18n from '@/i18n';
import type { AIInsightChart, FatFinderReport, SafeToSpendResponse } from '@budget/shared-types';

const stsStorage = new MMKV({ id: 'safe-to-spend' });

/**
 * Safe-to-Spend is ACCOUNT-scoped data, so its cache keys carry the account id.
 *
 * They did not, and the consequence was another account's money on the landing
 * screen as the headline number. Two separate mechanisms produced it:
 *
 *  1. `GET /insights/safe-to-spend` was issued before `accountStore` had
 *     resolved `currentAccountId`, so `api.setAccountIdGetter` supplied nothing,
 *     no `X-Account-Id` header went out, and the API's `AccountContextGuard`
 *     fell back to `req.user.defaultAccountId` — a DIFFERENT account for anyone
 *     whose selected account is not their default. Measured against the real
 *     API: with the header the account's figure was 683.41 (wallet 17085.18),
 *     without it 0 (wallet -10127.07), and the value the app had cached was
 *     byte-identical to the header-less one.
 *  2. The result was then written under bare `sts_data` / `sts_updated_at`, so
 *     it survived an account switch and was painted for whichever account came
 *     next — and outlived the session that produced it, because `reset()`
 *     cleared in-memory state but never touched MMKV.
 *
 * Keying is deliberately preferred over "clear the cache on switch": nothing
 * currently hooks account switches (`switchAccount` only sets the id and
 * persists it), so a clear-on-switch rule is one more thing to remember and one
 * more place to forget it; and it would throw away a still-valid cache for the
 * account the user switches back to, defeating the offline instant-paint this
 * cache exists for. `walletStore`'s `accountSummaries` map is the same choice
 * already made once in this codebase.
 */
const STS_DATA_PREFIX = 'sts_data';
const STS_UPDATED_AT_PREFIX = 'sts_updated_at';

interface CachedSafeToSpend {
  data: SafeToSpendResponse;
  updatedAt: number | null;
}

function readCachedSafeToSpend(accountId: string): CachedSafeToSpend | null {
  try {
    const raw = stsStorage.getString(`${STS_DATA_PREFIX}:${accountId}`);
    if (!raw) return null;
    return {
      data: JSON.parse(raw) as SafeToSpendResponse,
      updatedAt: stsStorage.getNumber(`${STS_UPDATED_AT_PREFIX}:${accountId}`) ?? null,
    };
  } catch {
    return null;
  }
}

function writeCachedSafeToSpend(
  accountId: string,
  data: SafeToSpendResponse,
  updatedAt: number,
): void {
  try {
    stsStorage.set(`${STS_DATA_PREFIX}:${accountId}`, JSON.stringify(data));
    stsStorage.set(`${STS_UPDATED_AT_PREFIX}:${accountId}`, updatedAt);
  } catch {
    // Caching is best-effort — a failed write must never fail the load.
  }
}

interface InsightsState {
  aiInsights: AIInsightChart[];
  isLoading: boolean;
  error: string | null;
  lastFetched: string | null;
  aiInsightsProGated: boolean;

  fatFinderReport: FatFinderReport | null;
  fatFinderLoading: boolean;
  fatFinderError: string | null;
  fatFinderMonth: number; // 1-based (1=January)
  fatFinderYear: number;
  fatFinderProGated: boolean;

  safeToSpend: SafeToSpendResponse | null;
  safeToSpendLoading: boolean;
  safeToSpendError: string | null;
  safeToSpendUpdatedAt: number | null;

  loadAIInsights: (language?: string) => Promise<void>;
  dismissInsight: (id: string) => void;
  loadFatFinder: (language?: string, forceRegenerate?: boolean, month?: number, year?: number) => Promise<void>;
  setFatFinderPeriod: (month: number, year: number) => void;
  loadSafeToSpend: () => Promise<void>;
  reset: () => void;
}

const now = new Date();

export const useInsightsStore = create<InsightsState>()((set) => ({
  aiInsights: [],
  isLoading: false,
  error: null,
  lastFetched: null,
  aiInsightsProGated: false,

  fatFinderReport: null,
  fatFinderLoading: false,
  fatFinderError: null,
  fatFinderMonth: now.getMonth() + 1,
  fatFinderYear: now.getFullYear(),
  fatFinderProGated: false,

  // Deliberately NOT hydrated from MMKV here. At module-init time no account
  // is known yet (`accountStore.loadAccounts()` has not run), so any value read
  // here could only be attributed to a guess. `loadSafeToSpend` hydrates the
  // cache for the resolved account instead, which keeps the instant offline
  // paint without ever attributing a figure to the wrong account.
  safeToSpend: null,
  safeToSpendLoading: false,
  safeToSpendError: null,
  safeToSpendUpdatedAt: null,

  loadAIInsights: async (language?: string) => {
    set({ isLoading: true, error: null, aiInsightsProGated: false });
    try {
      const response = await api.getAIInsights(language);
      set({
        aiInsights: response.insights,
        isLoading: false,
        lastFetched: response.generatedAt,
      });
    } catch (err) {
      const isProGated = (err as { status?: number }).status === 403;
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load insights',
        aiInsightsProGated: isProGated,
      });
      if (isProGated) {
        useUpgradeStore.getState().show(i18n.t('insights.proRequired'), 'pro');
      }
    }
  },

  dismissInsight: (id: string) => {
    set((state) => ({
      aiInsights: state.aiInsights.filter((i) => i.id !== id),
    }));
  },

  loadFatFinder: async (language?: string, forceRegenerate?: boolean, month?: number, year?: number) => {
    set({ fatFinderLoading: true, fatFinderError: null, fatFinderProGated: false });
    if (month != null && year != null) {
      set({ fatFinderMonth: month, fatFinderYear: year });
    }
    try {
      const response = await api.getFatFinderReport(language, forceRegenerate, month, year);
      set({
        fatFinderReport: response.report,
        fatFinderLoading: false,
      });
      useSubscriptionStore.getState().loadUsage();
    } catch (err) {
      const isProGated = (err as { status?: number }).status === 403;
      set({
        fatFinderLoading: false,
        fatFinderError: err instanceof Error ? err.message : 'Failed to load fat finder report',
        fatFinderProGated: isProGated,
      });
      if (isProGated) {
        useUpgradeStore.getState().show(i18n.t('subscription.limitReachedBody'), 'pro');
      }
    }
  },

  setFatFinderPeriod: (month: number, year: number) => {
    set({ fatFinderMonth: month, fatFinderYear: year, fatFinderReport: null });
  },

  /**
   * Loads Safe-to-Spend for the CURRENTLY SELECTED account, and refuses to
   * produce a figure it cannot attribute to that account.
   *
   * The capture-then-recheck shape is not invented here — it is the pattern
   * `walletStore.loadWallet` already uses for the same hazard a few files over
   * (read `currentAccountId` once, bail when it is null, re-check it after
   * every await). This is the third rail of an account-scoped read, and the
   * store action is where it belongs:
   *
   *  - NOT `HttpClient`: it cannot tell an account-scoped endpoint from an
   *    account-less one without an allow-list spanning ~24 domain api files,
   *    which is the same "the next caller forgets" failure with more ceremony
   *    and more places to be wrong. And the only thing it could usefully do —
   *    block until an account exists — would hang forever for a user who
   *    legitimately has none, turning a wrong number into a dead app.
   *  - NOT the caller alone: `useSafeToSpend` is one entry point; `widgetData`
   *    reads this state too, and the next screen that wants the figure will
   *    call the store, not the hook. A guard on one hook protects one hook.
   *
   * The caller still has its own, different job — re-invoking this on an
   * account change, which no guard can supply. See `useSafeToSpend`.
   */
  loadSafeToSpend: async () => {
    const accountId = useAccountStore.getState().currentAccountId;

    // No account resolved yet (cold start, before `accountStore.loadAccounts()`
    // completes) — an account-scoped read issued now is answered for the user's
    // DEFAULT account, which is how another account's money reached the hero.
    // Show nothing rather than something plausible and wrong; the caller
    // re-invokes this the moment the account resolves.
    if (!accountId) {
      set({
        safeToSpend: null,
        safeToSpendUpdatedAt: null,
        safeToSpendLoading: false,
        safeToSpendError: null,
      });
      return;
    }

    // Instant offline paint, from THIS account's own cache entry. Replaces the
    // module-init MMKV read, which ran before any account was known.
    const cached = readCachedSafeToSpend(accountId);
    set({
      safeToSpend: cached?.data ?? null,
      safeToSpendUpdatedAt: cached?.updatedAt ?? null,
      safeToSpendLoading: true,
      safeToSpendError: null,
    });

    try {
      const response = await api.getSafeToSpend();
      const updatedAt = Date.now();

      // The account can change while the request is in flight — and the header
      // is read from the getter mid-request (after the `await getAuthToken()`),
      // so a switch at any point during the call means we cannot prove which
      // account answered. Attribute only when the account held still across the
      // whole request; otherwise neither cache nor paint it, and leave state to
      // the newer load the switch already triggered.
      if (useAccountStore.getState().currentAccountId !== accountId) return;

      writeCachedSafeToSpend(accountId, response, updatedAt);
      set({
        safeToSpend: response,
        safeToSpendLoading: false,
        safeToSpendUpdatedAt: updatedAt,
      });
    } catch (err) {
      if (useAccountStore.getState().currentAccountId !== accountId) return;
      // Leave this account's cached data intact; only update loading/error.
      set({
        safeToSpendLoading: false,
        safeToSpendError: err instanceof Error ? err.message : 'Failed to load safe-to-spend',
      });
    }
  },

  reset: () => {
    // `reset()` runs on logout. Clearing only in-memory state left every
    // account's cached figure on disk for whoever signs in next — the store is
    // a dedicated MMKV instance holding nothing else, so clearing it whole is
    // exactly right. `walletStore.reset()` deletes its own cache for the same
    // reason.
    try {
      stsStorage.clearAll();
    } catch {
      // Never let a storage failure block sign-out.
    }
    const current = new Date();
    set({
      aiInsights: [],
      isLoading: false,
      error: null,
      lastFetched: null,
      aiInsightsProGated: false,
      fatFinderReport: null,
      fatFinderLoading: false,
      fatFinderError: null,
      fatFinderMonth: current.getMonth() + 1,
      fatFinderYear: current.getFullYear(),
      fatFinderProGated: false,
      safeToSpend: null,
      safeToSpendLoading: false,
      safeToSpendError: null,
      safeToSpendUpdatedAt: null,
    });
  },
}));
