import { create } from 'zustand';
import { api } from '../services/api';
import * as investmentRepo from '../db/investmentRepository';
import { useAccountStore } from './accountStore';
import { generateUUID } from '@budget/shared-utils';
import type {
  Asset,
  PortfolioHolding,
  InvestmentTransaction,
  PortfolioSummary,
  AssetType,
  InvestmentTransactionType,
  AIInsightChart,
} from '@budget/shared-types';

interface InvestmentState {
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

const getAccountId = () => useAccountStore.getState().currentAccountId;
const getUserId = () => {
  const accounts = useAccountStore.getState().accounts;
  const currentId = useAccountStore.getState().currentAccountId;
  const current = accounts.find((a) => a.id === currentId);
  return current?.ownerId || '';
};

export const useInvestmentStore = create<InvestmentState>()((set, get) => ({
  holdings: [],
  transactions: {},
  summary: null,
  performanceData: null,
  performanceLoading: false,
  assetPriceHistory: {},
  assetPriceLoading: false,
  isLoading: false,
  error: null,
  lastPriceUpdate: null,
  aiInsights: [],
  insightsLoading: false,
  insightsError: null,

  loadHoldings: async () => {
    const accountId = getAccountId();
    if (!accountId) return;

    set({ isLoading: true, error: null });

    try {
      // Load from local DB first
      const localHoldings = await investmentRepo.loadHoldingsByAccount(accountId);

      // Attach asset data from local cache
      const holdingsWithAssets = await Promise.all(
        localHoldings.map(async (h) => {
          const asset = await investmentRepo.loadAssetById(h.assetId);
          return { ...h, asset: asset ?? undefined };
        }),
      );

      set({ holdings: holdingsWithAssets, isLoading: false });

      // Then sync from server in background
      get().loadHoldingsFromServer();
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  loadHoldingsFromServer: async () => {
    try {
      const serverHoldings = await api.getPortfolioHoldings();
      if (!serverHoldings || serverHoldings.length === 0) return;

      // Upsert assets and holdings locally
      for (const sh of serverHoldings) {
        if (sh.asset) {
          await investmentRepo.upsertAsset({
            id: sh.asset.id,
            symbol: sh.asset.symbol,
            name: sh.asset.name,
            type: sh.asset.type,
            exchange: sh.asset.exchange,
            currentPrice: sh.asset.currentPrice ? Number(sh.asset.currentPrice) : undefined,
            priceCurrency: sh.asset.priceCurrency || 'USD',
            logoUrl: sh.asset.logoUrl,
            lastPriceUpdate: sh.asset.lastPriceUpdate ? new Date(sh.asset.lastPriceUpdate) : undefined,
            createdAt: new Date(sh.asset.createdAt),
            updatedAt: new Date(sh.asset.updatedAt),
          });
        }

        // Remove local duplicate: if server holding's clientId differs from server id,
        // the local version (with clientId as its id) still exists — remove it
        // and rebase any local transactions to point to the server holding id
        if (sh.clientId && sh.clientId !== sh.id) {
          await investmentRepo.rebaseTransactionsHoldingId(sh.clientId, sh.id);
          await investmentRepo.deleteHoldingById(sh.clientId);
        }

        await investmentRepo.insertHolding({
          id: sh.id,
          localId: sh.clientId || sh.id,
          serverId: sh.id,
          accountId: sh.accountId,
          userId: sh.userId,
          assetId: sh.assetId,
          quantity: Number(sh.quantity),
          averageCostBasis: Number(sh.averageCostBasis),
          totalInvested: Number(sh.totalInvested),
          notes: sh.notes,
          createdAt: new Date(sh.createdAt),
          updatedAt: new Date(sh.updatedAt),
          isDeleted: sh.isDeleted || false,
          syncStatus: 'synced',
          syncVersion: sh.syncVersion || 0,
        });

        // Recalculate from local transactions (server may have stale quantity
        // if transactions were synced with wrong holdingId)
        await investmentRepo.recalculateHolding(sh.id);

        // Push local pending transactions to server so analytics/chart work
        try {
          const localTxs = await investmentRepo.loadTransactionsByHolding(sh.id);
          const pendingTxs = localTxs.filter((t) => t.syncStatus === 'pending' && !t.serverId);
          for (const ptx of pendingTxs) {
            try {
              await api.createInvestmentTransaction({
                localId: ptx.localId,
                holdingId: sh.id,
                type: ptx.type,
                quantity: ptx.quantity,
                pricePerUnit: ptx.pricePerUnit,
                fee: ptx.fee || 0,
                date: new Date(ptx.date).toISOString(),
                notes: ptx.notes,
              });
            } catch {
              // Transaction may already exist on server
            }
          }
        } catch {
          // Non-critical, continue
        }
      }

      // Reload from local
      const accountId = getAccountId();
      if (!accountId) return;
      const localHoldings = await investmentRepo.loadHoldingsByAccount(accountId);
      const holdingsWithAssets = await Promise.all(
        localHoldings.map(async (h) => {
          const asset = await investmentRepo.loadAssetById(h.assetId);
          return { ...h, asset: asset ?? undefined };
        }),
      );
      set({ holdings: holdingsWithAssets });

      // Reload performance data now that server has synced transactions
      get().loadPerformance();
    } catch (error) {
      console.error('[InvestmentStore] Failed to sync from server:', error);
    }
  },

  addHolding: async (dto) => {
    const accountId = getAccountId();
    const userId = getUserId();
    if (!accountId) throw new Error('No account selected');

    const localId = generateUUID();
    const now = new Date();

    // Create a temporary local asset
    const assetId = generateUUID();
    const tempAsset: Asset = {
      id: assetId,
      symbol: dto.assetSymbol.toUpperCase(),
      name: dto.assetName,
      type: dto.assetType,
      exchange: dto.assetExchange,
      priceCurrency: dto.assetCurrency || 'USD',
      createdAt: now,
      updatedAt: now,
    };
    await investmentRepo.upsertAsset(tempAsset);

    const holding: PortfolioHolding = {
      id: localId,
      localId,
      accountId,
      userId,
      assetId,
      quantity: 0,
      averageCostBasis: 0,
      totalInvested: 0,
      notes: dto.notes,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: 'pending',
      syncVersion: 0,
    };

    await investmentRepo.insertHolding(holding);

    set((state) => ({
      holdings: [{ ...holding, asset: tempAsset }, ...state.holdings],
    }));

    // Sync to server
    try {
      const serverHolding = await api.createPortfolioHolding({
        localId,
        assetSymbol: dto.assetSymbol,
        assetName: dto.assetName,
        assetType: dto.assetType,
        assetExchange: dto.assetExchange,
        assetCurrency: dto.assetCurrency,
        notes: dto.notes,
      });

      if (serverHolding) {
        // Update local with server data
        const serverAsset: Asset | undefined = serverHolding.asset
          ? {
              id: serverHolding.asset.id,
              symbol: serverHolding.asset.symbol,
              name: serverHolding.asset.name,
              type: serverHolding.asset.type,
              exchange: serverHolding.asset.exchange,
              currentPrice: serverHolding.asset.currentPrice ? Number(serverHolding.asset.currentPrice) : undefined,
              priceCurrency: serverHolding.asset.priceCurrency || 'USD',
              createdAt: new Date(serverHolding.asset.createdAt),
              updatedAt: new Date(serverHolding.asset.updatedAt),
            }
          : undefined;

        if (serverAsset) {
          await investmentRepo.upsertAsset(serverAsset);
        }
        await investmentRepo.updateHolding(localId, {
          serverId: serverHolding.id,
          syncStatus: 'synced',
        });

        // Update Zustand state with server data (including price)
        set((state) => ({
          holdings: state.holdings.map((h) =>
            h.id === localId
              ? { ...h, serverId: serverHolding.id, syncStatus: 'synced' as const, asset: serverAsset ?? h.asset }
              : h,
          ),
        }));
      }
    } catch (error) {
      console.error('[InvestmentStore] Failed to sync holding:', error);
    }

    return holding;
  },

  removeHolding: async (holdingId) => {
    const holding = get().holdings.find((h) => h.id === holdingId);
    const serverHoldingId = holding?.serverId || holdingId;

    await investmentRepo.softDeleteHolding(holdingId);
    set((state) => ({
      holdings: state.holdings.filter((h) => h.id !== holdingId),
    }));

    try {
      await api.removePortfolioHolding(serverHoldingId);
    } catch (error) {
      console.error('[InvestmentStore] Failed to remove holding on server:', error);
    }
  },

  loadTransactions: async (holdingId) => {
    try {
      // Deduplicate any existing duplicates first
      await investmentRepo.deduplicateTransactions();

      const txs = await investmentRepo.loadTransactionsByHolding(holdingId);
      set((state) => ({
        transactions: { ...state.transactions, [holdingId]: txs },
      }));

      // Resolve server holding ID
      const holding = get().holdings.find((h) => h.id === holdingId);
      const serverHoldingId = holding?.serverId || holdingId;

      try {
        // Push local unsynced transactions to server first
        const pendingTxs = txs.filter((t) => t.syncStatus === 'pending' && !t.serverId);
        for (const ptx of pendingTxs) {
          try {
            await api.createInvestmentTransaction({
              localId: ptx.localId,
              holdingId: serverHoldingId,
              type: ptx.type,
              quantity: ptx.quantity,
              pricePerUnit: ptx.pricePerUnit,
              fee: ptx.fee || 0,
              date: new Date(ptx.date).toISOString(),
              notes: ptx.notes,
            });
          } catch {
            // Transaction might already exist on server, continue
          }
        }

        // Pull from server (use server holding ID)
        const serverTxs = await api.getInvestmentTransactions(serverHoldingId);
        if (serverTxs && serverTxs.length > 0) {
          for (const stx of serverTxs) {
            await investmentRepo.insertTransaction({
              id: stx.id,
              localId: stx.clientId || stx.id,
              serverId: stx.id,
              holdingId,
              accountId: stx.accountId,
              userId: stx.userId,
              type: stx.type,
              quantity: Number(stx.quantity),
              pricePerUnit: Number(stx.pricePerUnit),
              totalAmount: Number(stx.totalAmount),
              fee: Number(stx.fee),
              date: new Date(stx.date),
              notes: stx.notes,
              createdAt: new Date(stx.createdAt),
              updatedAt: new Date(stx.updatedAt),
              isDeleted: stx.isDeleted || false,
              syncStatus: 'synced',
              syncVersion: stx.syncVersion || 0,
            });
          }
          const updated = await investmentRepo.loadTransactionsByHolding(holdingId);
          set((state) => ({
            transactions: { ...state.transactions, [holdingId]: updated },
          }));
        }
      } catch {
        // Silently fail server sync
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  addTransaction: async (dto) => {
    const accountId = getAccountId();
    const userId = getUserId();
    if (!accountId) throw new Error('No account selected');

    const localId = generateUUID();
    const now = new Date();
    const totalAmount = dto.quantity * dto.pricePerUnit + (dto.fee || 0);

    const tx: InvestmentTransaction = {
      id: localId,
      localId,
      holdingId: dto.holdingId,
      accountId,
      userId,
      type: dto.type,
      quantity: dto.quantity,
      pricePerUnit: dto.pricePerUnit,
      totalAmount,
      fee: dto.fee || 0,
      date: dto.date,
      notes: dto.notes,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: 'pending',
      syncVersion: 0,
    };

    await investmentRepo.insertTransaction(tx);

    // Recalculate holding
    const result = await investmentRepo.recalculateHolding(dto.holdingId);

    // Update local state
    set((state) => {
      const holdingTxs = [...(state.transactions[dto.holdingId] || []), tx]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return {
        transactions: { ...state.transactions, [dto.holdingId]: holdingTxs },
        holdings: state.holdings.map((h) =>
          h.id === dto.holdingId
            ? { ...h, quantity: result.quantity, averageCostBasis: result.averageCostBasis, totalInvested: result.totalInvested }
            : h,
        ),
      };
    });

    // Sync to server — use server holding ID if available
    const holdingForSync = get().holdings.find((h) => h.id === dto.holdingId);
    const serverHoldingId = holdingForSync?.serverId || dto.holdingId;
    try {
      await api.createInvestmentTransaction({
        localId,
        holdingId: serverHoldingId,
        type: dto.type,
        quantity: dto.quantity,
        pricePerUnit: dto.pricePerUnit,
        fee: dto.fee || 0,
        date: dto.date.toISOString(),
        notes: dto.notes,
      });
    } catch (error) {
      console.error('[InvestmentStore] Failed to sync transaction:', error);
    }

    return tx;
  },

  removeTransaction: async (txId, holdingId) => {
    const txs = get().transactions[holdingId] || [];
    const tx = txs.find((t) => t.id === txId);
    const serverTxId = tx?.serverId || txId;

    await investmentRepo.softDeleteTransaction(txId);
    const result = await investmentRepo.recalculateHolding(holdingId);

    set((state) => ({
      transactions: {
        ...state.transactions,
        [holdingId]: (state.transactions[holdingId] || []).filter((t) => t.id !== txId),
      },
      holdings: state.holdings.map((h) =>
        h.id === holdingId
          ? { ...h, quantity: result.quantity, averageCostBasis: result.averageCostBasis, totalInvested: result.totalInvested }
          : h,
      ),
    }));

    try {
      await api.deleteInvestmentTransaction(serverTxId);
    } catch (error) {
      console.error('[InvestmentStore] Failed to remove transaction on server:', error);
    }
  },

  loadSummary: async () => {
    set({ isLoading: true });
    try {
      const response = await api.getPortfolioSummary();
      if (response) {
        set((state) => {
          // Enrich holdings with price and allocation data from summary
          const summaryHoldings = response.summary?.holdings || [];
          const enrichedHoldings = summaryHoldings.length > 0
            ? state.holdings.map((h) => {
                const sh = summaryHoldings.find(
                  (s: any) => s.holdingId === h.id || s.holdingId === h.serverId,
                );
                if (sh && h.asset) {
                  return {
                    ...h,
                    asset: { ...h.asset, currentPrice: sh.currentPrice },
                    allocationPercent: sh.allocationPercent,
                  };
                }
                return h;
              })
            : state.holdings;

          return {
            summary: response.summary,
            lastPriceUpdate: response.lastPriceUpdate,
            holdings: enrichedHoldings,
            isLoading: false,
          };
        });

        // Also update local asset prices in SQLite for offline access
        const summaryHoldings = response.summary?.holdings || [];
        for (const sh of summaryHoldings) {
          if (sh.assetId && sh.currentPrice) {
            await investmentRepo.updateAssetPrice(sh.assetId, sh.currentPrice);
          }
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  loadPerformance: async (period: string = 'month') => {
    set({ performanceLoading: true });
    try {
      const data = await api.getPortfolioAnalytics(period);
      if (data?.performance?.dates?.length > 0) {
        set({
          performanceData: {
            dates: data.performance.dates,
            values: data.performance.values,
          },
          performanceLoading: false,
        });
      } else {
        console.warn('[InvestmentStore] loadPerformance: no chart data returned', {
          hasPerformance: !!data?.performance,
          datesLength: data?.performance?.dates?.length ?? 0,
        });
        set({ performanceData: null, performanceLoading: false });
      }
    } catch (err) {
      console.error('[InvestmentStore] loadPerformance failed:', err);
      set({ performanceData: null, performanceLoading: false });
    }
  },

  loadAssetPriceHistory: async (holdingId: string, days: number = 30) => {
    // Use server holding ID for API call
    const holding = get().holdings.find((h) => h.id === holdingId);
    const serverHoldingId = holding?.serverId || holdingId;

    set({ assetPriceLoading: true });
    try {
      const data = await api.getAssetPriceHistory(serverHoldingId, days);
      if (data?.dates?.length > 0) {
        set((state) => ({
          assetPriceHistory: {
            ...state.assetPriceHistory,
            [holdingId]: { dates: data.dates, prices: data.prices },
          },
          assetPriceLoading: false,
        }));
      } else {
        set({ assetPriceLoading: false });
      }
    } catch {
      set({ assetPriceLoading: false });
    }
  },

  refreshPrices: async () => {
    try {
      await api.refreshInvestmentPrices();
      // Reload summary after refresh
      await get().loadSummary();
    } catch (error) {
      console.error('[InvestmentStore] Failed to refresh prices:', error);
    }
  },

  loadInvestmentInsights: async (language?: string) => {
    set({ insightsLoading: true, insightsError: null });
    try {
      const response = await api.getInvestmentInsights(language);
      set({
        aiInsights: response.insights || [],
        insightsLoading: false,
      });
    } catch (error) {
      set({
        insightsError: (error as Error).message,
        insightsLoading: false,
      });
    }
  },

  dismissInsight: (id: string) => {
    set((state) => ({
      aiInsights: state.aiInsights.filter((insight) => insight.id !== id),
    }));
  },

  clearError: () => set({ error: null }),

  reset: () => set({
    holdings: [],
    transactions: {},
    summary: null,
    performanceData: null,
    performanceLoading: false,
    assetPriceHistory: {},
    assetPriceLoading: false,
    isLoading: false,
    error: null,
    lastPriceUpdate: null,
    aiInsights: [],
    insightsLoading: false,
    insightsError: null,
  }),
}));
