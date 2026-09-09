import { create } from 'zustand';
import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { subscribeWithSelector } from 'zustand/middleware';
import type { WalletBalance, CurrencyExchange, AccountTransfer, WalletSummary, Currency, WalletMonthlyDeltaPoint } from '@budget/shared-types';
import {
  loadAllWalletBalances,
  getExpenseTotalsByCurrency,
  getIncomeTotalsByCurrency,
  getExchangeTotals,
  getTransferTotals,
} from '@/db/walletRepository';
import { loadAllExchanges } from '@/db/currencyExchangeRepository';
import { loadTransfersByAccount } from '@/db/accountTransferRepository';
import { api } from '@/services/api';
import { filterConsumption } from '@/utils/consumption';
import { useAccountStore } from './accountStore';
import { useExpenseStore } from './expenseStore';
import { useIncomeStore } from './incomeStore';
import { buildWalletSummary } from '../features/wallet/walletSummary';
import { syncWalletFromServer } from './walletSync';
import {
  setInitialBalanceAction,
  updateInitialBalanceAction,
  removeBalanceAction,
} from './walletBalanceActions';
import {
  addExchangeAction,
  updateExchangeAction,
  deleteExchangeAction,
} from './currencyExchangeActions';
import {
  addTransferAction,
  updateTransferAction,
  deleteTransferAction,
  syncPendingTransfersAction,
  type TransferWriteResult,
} from './accountTransferActions';

// Sum amounts grouped by a currency key. Used to aggregate in-memory store
// data on web, where the SQLite GROUP BY helpers are no-ops.
function sumByCurrency<T>(
  items: T[],
  keyOf: (t: T) => string,
  amountOf: (t: T) => number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = keyOf(it);
    out[k] = (out[k] || 0) + amountOf(it);
  }
  return out;
}

// Balances of *other* accounts, for the transfer form. Cached in MMKV so the form
// paints numbers on open instead of after a round trip. The current account is not
// served from here — `walletSummary` below is computed locally and is exact.
const accountSummariesStorage = new MMKV({ id: 'wallet-account-summaries' });
const ACCOUNT_SUMMARIES_KEY = 'account_summaries';

function loadCachedAccountSummaries(): Record<string, WalletSummary[]> {
  try {
    const raw = accountSummariesStorage.getString(ACCOUNT_SUMMARIES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, WalletSummary[]>) : {};
  } catch {
    return {};
  }
}

interface WalletState {
  walletBalances: WalletBalance[];
  exchanges: CurrencyExchange[];
  transfers: AccountTransfer[];
  walletSummary: WalletSummary[];
  accountSummaries: Record<string, WalletSummary[]>;
  monthlyHistory: WalletMonthlyDeltaPoint[];
  selectedMonths: 6 | 12;
  isHistoryLoading: boolean;
  isLoading: boolean;
  error: string | null;
  /**
   * When the server pull last *succeeded*, or `null` if it has not yet this
   * session. Additive and read by nothing on mobile — the wallet twin of the
   * `lastPullAt` fields on `expenseStore`/`incomeStore`, and it exists for the
   * same reason: on web SQLite is a mock and `syncWalletFromServer` swallows a
   * failed pull with a `console.warn`, setting no flag, so
   * `walletSummary.length === 0` cannot tell "this account holds no balances"
   * apart from "the wallet has not answered yet". The setup checklist read the
   * second as the first and told a fully-configured user to set a wallet
   * balance, for the moment it took the pull to land.
   */
  lastPullAt: number | null;

  // Actions
  loadWallet: () => Promise<void>;
  loadAccountSummaries: () => Promise<void>;
  loadMonthlyHistory: (months: 6 | 12) => Promise<void>;
  setInitialBalance: (currencyCode: Currency, amount: number) => WalletBalance;
  updateInitialBalance: (id: string, amount: number) => void;
  removeBalance: (id: string) => void;
  addExchange: (data: {
    fromCurrency: Currency;
    toCurrency: Currency;
    fromAmount: number;
    toAmount: number;
    exchangeRate: number;
    date: Date;
    notes?: string;
  }) => CurrencyExchange;
  updateExchange: (id: string, updates: Partial<CurrencyExchange>) => void;
  deleteExchange: (id: string) => void;
  addTransfer: (data: {
    fromAccountId: string;
    fromCurrency: Currency;
    fromAmount: number;
    toAccountId: string;
    toCurrency: Currency;
    toAmount: number;
    exchangeRate: number;
    date: Date;
    notes?: string;
    countAsIncome?: boolean;
  }) => AccountTransfer;
  updateTransfer: (id: string, updates: Partial<AccountTransfer>) => Promise<TransferWriteResult>;
  deleteTransfer: (id: string) => void;
  syncPendingTransfers: () => Promise<void>;

  // Computed
  computeWalletSummary: () => Promise<WalletSummary[]>;
  /**
   * The local reconstruction, kept separate so the native path can keep using
   * it while web asks the server instead. Called directly only by
   * `computeWalletSummary` and by its own test.
   */
  computeWalletSummaryLocal: () => Promise<WalletSummary[]>;
  getBalanceForCurrency: (currencyCode: Currency) => number;

  reset: () => void;
}

// This store is deliberately kept as a single Zustand hook so the ~20 mobile
// screens/hooks that already depend on `useWalletStore`'s shape don't need to
// change (see docs/tech-debt/wallet-store-god-class.md). What moved out is
// the *logic*, not the state: balance/exchange/transfer CRUD each live in
// their own file (walletBalanceActions.ts / currencyExchangeActions.ts /
// accountTransferActions.ts) and the server-pull merge lives in walletSync.ts
// — this file wires them to `set`/`get` and keeps only the cross-cutting
// read-side aggregation (`loadWallet`, `loadAccountSummaries`,
// `loadMonthlyHistory`, `computeWalletSummary`, `getBalanceForCurrency`),
// mirroring how expenseStore.ts delegates to expenseSync.ts.
export const useWalletStore = create<WalletState>()(
  subscribeWithSelector((set, get) => ({
    walletBalances: [],
    exchanges: [],
    transfers: [],
    walletSummary: [],
    accountSummaries: loadCachedAccountSummaries(),
    monthlyHistory: [],
    selectedMonths: 6,
    isHistoryLoading: false,
    isLoading: false,
    error: null,
    lastPullAt: null,

    loadAccountSummaries: async () => {
      try {
        const result = await api.getAllWalletSummaries();
        const map: Record<string, WalletSummary[]> = {};
        for (const entry of result.accounts) {
          map[entry.accountId] = entry.balances as WalletSummary[];
        }
        accountSummariesStorage.set(ACCOUNT_SUMMARIES_KEY, JSON.stringify(map));
        set({ accountSummaries: map });
      } catch (e) {
        // Offline or server hiccup: keep whatever is cached. The form shows a dash
        // for accounts it has no figure for rather than a made-up zero.
        console.warn('Failed to load account wallet summaries:', e);
      }
    },

    loadMonthlyHistory: async (months) => {
      set({ isHistoryLoading: true, selectedMonths: months });
      try {
        const result = await api.getWalletMonthlyHistory(months);
        set({ monthlyHistory: result.months, isHistoryLoading: false });
      } catch {
        set({ isHistoryLoading: false });
      }
    },

    loadWallet: async () => {
      set({ isLoading: true, error: null });
      try {
        const accountId = useAccountStore.getState().currentAccountId;
        if (!accountId) {
          set({ isLoading: false });
          return;
        }

        // 1. Load from local DB
        const localBalances = await loadAllWalletBalances(accountId);
        const localExchanges = await loadAllExchanges(accountId);
        const localTransfers = await loadTransfersByAccount(accountId);
        // Guard: abort if account switched during async operation
        if (useAccountStore.getState().currentAccountId !== accountId) return;
        set({ walletBalances: localBalances, exchanges: localExchanges, transfers: localTransfers });

        // 2. Compute summary from local data
        const summary = await get().computeWalletSummary();
        set({ walletSummary: summary, isLoading: false });

        // 3. Push queued writes, then sync from server. Order matters: the pull
        // skips pending rows, so anything the push just landed is picked up with the
        // server's own copy instead of staying pending until the next load.
        await syncPendingTransfersAction(set, get, accountId);
        if (useAccountStore.getState().currentAccountId !== accountId) return;

        // 4. Sync from server
        await syncWalletFromServer(set, get, accountId);
      } catch (e) {
        console.error('Failed to load wallet:', e);
        set({ error: 'Failed to load wallet', isLoading: false });
      }
    },

    setInitialBalance: (currencyCode, amount) => setInitialBalanceAction(set, get, currencyCode, amount),
    updateInitialBalance: (id, amount) => updateInitialBalanceAction(set, get, id, amount),
    removeBalance: (id) => removeBalanceAction(set, get, id),

    addExchange: (data) => addExchangeAction(set, get, data),
    updateExchange: (id, updates) => updateExchangeAction(set, get, id, updates),
    deleteExchange: (id) => deleteExchangeAction(set, get, id),

    addTransfer: (data) => addTransferAction(set, get, data),
    updateTransfer: (id, updates) => updateTransferAction(set, get, id, updates),
    deleteTransfer: (id) => deleteTransferAction(set, get, id),
    syncPendingTransfers: async () => {
      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) return;
      await syncPendingTransfersAction(set, get, accountId);
    },

    /**
     * How much money this account holds, per currency.
     *
     * **Native computes it; web asks the server.** The reconstruction below
     * (`computeWalletSummaryLocal`) needs `initialAmount`, expenses, incomes,
     * exchanges and transfers all present, which on native is guaranteed —
     * every one of them comes from SQLite, which holds the whole account, and
     * is available offline.
     *
     * On web SQLite is a no-op mock, so the same reconstruction reads the
     * in-memory stores and is correct only if four independent network pulls
     * have all landed first. They had not: `loadWallet` computes the summary in
     * the same `Promise.allSettled` batch that loads expenses, so the dashboard
     * rendered `0 + incomes - 0` and presented the account's total INCOME as its
     * balance (measured live: PLN 106 084 shown against a real balance of
     * 3 803,76), then never recomputed. `hydrateTransactions` already carried a
     * web-only recompute for that race, but it repairs only the
     * expenses/incomes half — a four-source reconstruction cannot be made
     * reliable by patching one source, which is why this replaces the approach
     * rather than adding a fifth patch.
     *
     * `GET /wallet/summary` is the server's own aggregate of exactly this
     * number, applies `EXCLUDE_SPLIT_RECEIVABLE` itself, and answers in ~300ms.
     * One request cannot race anything.
     *
     * **A failure returns the CURRENT summary, not an empty one.** The caller's
     * `set` then becomes a no-op, so a dropped request leaves whatever is on
     * screen instead of claiming the account is empty — the rule ABA-506 states
     * for the account list: a failed load and a successful empty load must
     * never leave the same state. `useHomeScreenData`'s retry is what actually
     * repairs it.
     *
     * Known trade-off: on web the mutation paths (add an exchange, a transfer,
     * an initial balance) also route through here, so the figure they show
     * comes from the server rather than from an optimistic local sum. If their
     * fire-and-forget write has not landed yet, the balance lags by one refresh
     * — the wallet screen's own `loadWallet` on focus and the dashboard's retry
     * both correct it.
     */
    computeWalletSummary: async () => {
      if (Platform.OS !== 'web') return get().computeWalletSummaryLocal();
      try {
        const result = await api.getWalletSummary();
        return (result.balances ?? []) as WalletSummary[];
      } catch (e) {
        // Expected whenever the network hiccups; never an error (ABA-157).
        console.warn('Wallet summary fetch failed, keeping the current figures:', e);
        return get().walletSummary;
      }
    },

    computeWalletSummaryLocal: async () => {
      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) return [];

      // Deleted rows are kept in the list on purpose: buildWalletSummary needs
      // them to tell "the user hid this currency" from "this currency has no
      // row yet and must be derived from the movements" (ABA-431).
      const balances = get().walletBalances;

      let expenseTotals: Record<string, number>;
      let incomeTotals: Record<string, number>;
      let exchangedIn: Record<string, number>;
      let exchangedOut: Record<string, number>;
      let transferredIn: Record<string, number>;
      let transferredOut: Record<string, number>;

      if (Platform.OS === 'web') {
        // SQLite aggregate helpers are no-ops on web — derive the same totals
        // from the in-memory stores so balances reflect actual transactions
        // (otherwise currentBalance would just equal the initial amount).
        // filterConsumption drops split-receivable debt rows — the money
        // already left the account as the original receipt expense, so
        // counting the receivable too would double the outflow. Mirrors the
        // native path's `getExpenseTotalsByCurrency` SQL guard. See
        // `src/utils/consumption.ts` for the full accounting rationale.
        const expenses = filterConsumption(useExpenseStore.getState().expenses).filter((e) => !e.isDeleted);
        const incomes = useIncomeStore.getState().incomes.filter((i) => !i.isDeleted);
        const exchanges = get().exchanges.filter((x) => !x.isDeleted);
        const transfers = get().transfers.filter((t) => !t.isDeleted);

        expenseTotals = sumByCurrency(expenses, (e) => e.currencyCode, (e) => e.amount);
        incomeTotals = sumByCurrency(incomes, (i) => i.currencyCode, (i) => i.amount);
        exchangedIn = sumByCurrency(exchanges, (x) => x.toCurrency, (x) => x.toAmount);
        exchangedOut = sumByCurrency(exchanges, (x) => x.fromCurrency, (x) => x.fromAmount);
        transferredIn = sumByCurrency(
          transfers.filter((t) => t.toAccountId === accountId && !t.countAsIncome),
          (t) => t.toCurrency,
          (t) => t.toAmount,
        );
        transferredOut = sumByCurrency(
          transfers.filter((t) => t.fromAccountId === accountId),
          (t) => t.fromCurrency,
          (t) => t.fromAmount,
        );
      } else {
        expenseTotals = await getExpenseTotalsByCurrency(accountId);
        incomeTotals = await getIncomeTotalsByCurrency(accountId);
        ({ exchangedIn, exchangedOut } = await getExchangeTotals(accountId));
        ({ transferredIn, transferredOut } = await getTransferTotals(accountId));
      }

      return buildWalletSummary(
        balances.map((b) => ({
          currencyCode: b.currencyCode,
          initialAmount: b.initialAmount,
          isDeleted: !!b.isDeleted,
        })),
        { incomeTotals, expenseTotals, exchangedIn, exchangedOut, transferredIn, transferredOut },
      );
    },

    getBalanceForCurrency: (currencyCode) => {
      const summary = get().walletSummary.find((s) => s.currencyCode === currencyCode);
      return summary?.currentBalance ?? 0;
    },

    reset: () => {
      // Drop the cached cross-account balances too — reset runs on logout, and the
      // next user must not see the previous one's figures.
      accountSummariesStorage.delete(ACCOUNT_SUMMARIES_KEY);
      set({ walletBalances: [], exchanges: [], transfers: [], walletSummary: [], accountSummaries: {}, monthlyHistory: [], selectedMonths: 6, isHistoryLoading: false, isLoading: false, error: null, lastPullAt: null });
    },
  })),
);
