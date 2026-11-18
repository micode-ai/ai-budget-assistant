/**
 * investmentTransactionActions.ts — transactions CRUD extracted from investmentStore.ts.
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

export const createTransactionActions = (
  set: InvestmentSet,
  get: InvestmentGet,
): Pick<InvestmentState, 'loadTransactions' | 'addTransaction' | 'removeTransaction'> => ({
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
});
