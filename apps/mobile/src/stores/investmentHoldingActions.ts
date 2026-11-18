/**
 * investmentHoldingActions.ts — holdings CRUD extracted from investmentStore.ts.
 */
import { api } from '../services/api';
import * as investmentRepo from '../db/investmentRepository';
import type { Asset, PortfolioHolding, InvestmentTransaction } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import {
  claimAccount,
  getAccountId,
  getUserId,
  switchedAway,
  type InvestmentGet,
  type InvestmentSet,
  type InvestmentState,
} from './investmentShared';

export const createHoldingActions = (
  set: InvestmentSet,
  get: InvestmentGet,
): Pick<InvestmentState, 'loadHoldings' | 'loadHoldingsFromServer' | 'addHolding' | 'removeHolding'> => ({
  loadHoldings: async () => {
    const accountId = getAccountId();
    if (!accountId) return;
    claimAccount(set, accountId);

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

      if (switchedAway(accountId)) return;
      set({ holdings: holdingsWithAssets, isLoading: false });

      // Then sync from server in background
      get().loadHoldingsFromServer();
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  loadHoldingsFromServer: async () => {
    const requestAccountId = getAccountId();
    try {
      const serverHoldings = await api.getPortfolioHoldings();
      if (switchedAway(requestAccountId)) return;
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
      if (!accountId || accountId !== requestAccountId) return;
      const localHoldings = await investmentRepo.loadHoldingsByAccount(accountId);
      const holdingsWithAssets = await Promise.all(
        localHoldings.map(async (h) => {
          const asset = await investmentRepo.loadAssetById(h.assetId);
          return { ...h, asset: asset ?? undefined };
        }),
      );
      if (switchedAway(accountId)) return;
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
});
