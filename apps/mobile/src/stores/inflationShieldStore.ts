import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { InflationShieldResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';

const storage = new MMKV({ id: 'inflation-shield' });

/**
 * The Inflation Shield is ACCOUNT-scoped data, so its cache keys carry the
 * account id — and the store is cleared on sign-out.
 *
 * Neither was true before, and the two omissions were not the same severity:
 *
 *  1. The keys were bare `shield_data` / `shield_updated_at`, read at
 *     module-init time when no account can possibly be known yet, so one
 *     account's stock-up figures were painted for the next account after a
 *     switch. `load()` also issued `GET /insights/inflation-shield` without
 *     waiting for `currentAccountId`, so during cold start no `X-Account-Id`
 *     header went out and `AccountContextGuard` answered for the user's
 *     DEFAULT account. This is the same pair of defects fixed in
 *     `insightsStore.ts` for Safe-to-Spend — see the long note there for the
 *     measured evidence and for why the guard belongs in the store action
 *     rather than in `HttpClient` or in a single caller.
 *  2. This store had no `reset()` AT ALL and was absent from the sign-out
 *     teardown in `authSessionActions.ts`. That is a different kind of
 *     problem from "which of my accounts is this": the cache survived a sign
 *     out and was read by whoever signed in NEXT on that device — one
 *     person's shopping and price data shown to another person on a shared
 *     or public machine.
 *
 * Keying rather than clear-on-switch, for the reasons given in
 * `insightsStore.ts`: nothing hooks account switches today, and clearing
 * would discard a still-valid cache for the account the user switches back
 * to, defeating the instant offline paint this cache exists for.
 */
const DATA_PREFIX = 'shield_data';
const UPDATED_AT_PREFIX = 'shield_updated_at';

interface CachedShield {
  data: InflationShieldResponse;
  updatedAt: number | null;
}

function readCached(accountId: string): CachedShield | null {
  try {
    const raw = storage.getString(`${DATA_PREFIX}:${accountId}`);
    if (!raw) return null;
    return {
      data: JSON.parse(raw) as InflationShieldResponse,
      updatedAt: storage.getNumber(`${UPDATED_AT_PREFIX}:${accountId}`) ?? null,
    };
  } catch {
    return null;
  }
}

function writeCached(accountId: string, data: InflationShieldResponse, updatedAt: number): void {
  try {
    storage.set(`${DATA_PREFIX}:${accountId}`, JSON.stringify(data));
    storage.set(`${UPDATED_AT_PREFIX}:${accountId}`, updatedAt);
  } catch {
    // Caching is best-effort — a failed write must never fail the load.
  }
}

interface InflationShieldState {
  data: InflationShieldResponse | null;
  loading: boolean;
  error: boolean;
  updatedAt: number | null;
  load: () => Promise<void>;
  reset: () => void;
}

export const useInflationShieldStore = create<InflationShieldState>()((set) => ({
  // Deliberately NOT hydrated from MMKV here. At module-init time no account is
  // known (`accountStore.loadAccounts()` has not run), so any value read here
  // could only be attributed to a guess. `load()` hydrates the cache for the
  // resolved account instead, which keeps the instant offline paint without
  // ever attributing figures to the wrong account.
  data: null,
  loading: false,
  error: false,
  updatedAt: null,

  /**
   * Loads the shield for the CURRENTLY SELECTED account, and refuses to produce
   * figures it cannot attribute to that account. Same capture-then-recheck
   * shape as `insightsStore.loadSafeToSpend` and `walletStore.loadWallet`.
   */
  load: async () => {
    const accountId = useAccountStore.getState().currentAccountId;

    // No account resolved yet (cold start, before `accountStore.loadAccounts()`
    // completes) — an account-scoped read issued now is answered for the user's
    // DEFAULT account. Show nothing rather than another account's figures; the
    // caller re-invokes this the moment the account resolves.
    if (!accountId) {
      set({ data: null, updatedAt: null, loading: false, error: false });
      return;
    }

    // Instant offline paint, from THIS account's own cache entry. Replaces the
    // module-init read, which ran before any account was known.
    const cached = readCached(accountId);
    set({
      data: cached?.data ?? null,
      updatedAt: cached?.updatedAt ?? null,
      loading: true,
      error: false,
    });

    try {
      const data = await api.getInflationShield();
      const updatedAt = Date.now();

      // The account can change while the request is in flight, and the
      // `X-Account-Id` header is read mid-request (after `await getAuthToken()`
      // inside `HttpClient.request`), so a switch at any point during the call
      // means we cannot prove which account answered. Attribute only when the
      // account held still across the whole request.
      if (useAccountStore.getState().currentAccountId !== accountId) return;

      writeCached(accountId, data, updatedAt);
      set({ data, loading: false, updatedAt });
    } catch (e) {
      if (useAccountStore.getState().currentAccountId !== accountId) return;
      // Keep this account's cached data; only flag the error.
      console.warn('[inflationShieldStore] load failed', e);
      set({ loading: false, error: true });
    }
  },

  /**
   * Called from the sign-out teardown in `authSessionActions.ts`. Clearing the
   * MMKV instance whole is exactly right: it is dedicated to this store and
   * holds nothing else, and every account's entry must go — the next person to
   * sign in on this device must not inherit any of them.
   */
  reset: () => {
    try {
      storage.clearAll();
    } catch {
      // Never let a storage failure block sign-out.
    }
    set({ data: null, loading: false, error: false, updatedAt: null });
  },
}));
