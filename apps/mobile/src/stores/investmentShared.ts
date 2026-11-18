/**
 * investmentShared.ts — state shape and account-scoping helpers shared by the
 * investment store and its action modules (holdings / transactions /
 * analytics). Kept separate so action modules need no circular import.
 */
import { useAccountStore } from './accountStore';
import type {
  Asset,
  PortfolioHolding,
  InvestmentTransaction,
  PortfolioSummary,
  AssetType,
  InvestmentTransactionType,
  AIInsightChart,
} from '@budget/shared-types';

export interface InvestmentState {
  holdings: (PortfolioHolding & { asset?: Asset; allocationPercent?: number })[];
  transactions: Record<string, InvestmentTransaction[]>; // keyed by holdingId
  summary: PortfolioSummary | null;
  performanceData: { dates: string[]; values: number[] } | null;
  performanceLoading: boolean;
  assetPriceHistory: Record<string, { dates: string[]; prices: number[] }>; // keyed by holdingId
  assetPriceLoading: boolean;
  isLoading: boolean;
  error: string | null;
  lastPriceUpdate: string | null;
  // AI Insights
  aiInsights: AIInsightChart[];
  insightsLoading: boolean;
  insightsError: string | null;

  // Actions
  loadHoldings: () => Promise<void>;
  loadHoldingsFromServer: () => Promise<void>;
  addHolding: (dto: {
    assetSymbol: string;
    assetName: string;
    assetType: AssetType;
    assetExchange?: string;
    assetCurrency?: string;
    notes?: string;
  }) => Promise<PortfolioHolding>;
  removeHolding: (holdingId: string) => Promise<void>;
  loadTransactions: (holdingId: string) => Promise<void>;
  addTransaction: (dto: {
    holdingId: string;
    type: InvestmentTransactionType;
    quantity: number;
    pricePerUnit: number;
    fee?: number;
    date: Date;
    notes?: string;
  }) => Promise<InvestmentTransaction>;
  removeTransaction: (txId: string, holdingId: string) => Promise<void>;
  loadSummary: () => Promise<void>;
  loadPerformance: (period?: string) => Promise<void>;
  loadAssetPriceHistory: (holdingId: string, days?: number) => Promise<void>;
  refreshPrices: () => Promise<void>;
  loadInvestmentInsights: (language?: string) => Promise<void>;
  dismissInsight: (id: string) => void;
  clearError: () => void;
  reset: () => void;
}

export type InvestmentSet = (
  partial:
    | Partial<InvestmentState>
    | ((state: InvestmentState) => Partial<InvestmentState>),
) => void;
export type InvestmentGet = () => InvestmentState;

export const getAccountId = () => useAccountStore.getState().currentAccountId;
export const getUserId = () => {
  const accounts = useAccountStore.getState().accounts;
  const currentId = useAccountStore.getState().currentAccountId;
  const current = accounts.find((a) => a.id === currentId);
  return current?.ownerId || '';
};

// Everything in this store except the loading/error flags belongs to one
// account. Remember which, so the first load for a different account drops the
// previous account's portfolio instead of showing it until (or, when the
// request fails, instead of) the new figures arriving.
export const ACCOUNT_SCOPED_EMPTY = {
  holdings: [],
  transactions: {},
  summary: null,
  performanceData: null,
  assetPriceHistory: {},
  lastPriceUpdate: null,
  aiInsights: [],
} satisfies Partial<InvestmentState>;
let _investmentAccountId: string | null = null;

/** Clears the store when it still holds another account's portfolio. */
export const claimAccount = (
  set: (partial: Partial<InvestmentState>) => void,
  accountId: string | null,
) => {
  if (_investmentAccountId === accountId) return;
  _investmentAccountId = accountId;
  set({ ...ACCOUNT_SCOPED_EMPTY });
};

/** Forgets which account the store holds (used by reset()). */
export const forgetAccount = () => {
  _investmentAccountId = null;
};

/** True when the user switched accounts while a request was out. */
export const switchedAway = (accountId: string | null) => getAccountId() !== accountId;
