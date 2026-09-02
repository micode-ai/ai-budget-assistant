/**
 * A transfer write has no pending-sync sweeper, so a rejected edit is NOT queued
 * for later — the next wallet pull overwrites the local row with the server's. The
 * reported bug: a MiCode -> Family transfer was corrected to House from the Family
 * screen, the server refused it, the client swallowed the refusal, and the edit
 * silently reverted with the money never arriving. These tests pin the two halves
 * of the fix: a refused write is rolled back and reported, and an accepted re-home
 * moves the linked income (the money) locally instead of waiting for two pulls.
 */
jest.mock('@/db/accountTransferRepository', () => ({
  insertTransfer: jest.fn().mockResolvedValue(undefined),
  updateTransferInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteTransfer: jest.fn().mockResolvedValue(undefined),
  setTransferServerId: jest.fn().mockResolvedValue(undefined),
  setTransferSyncStatus: jest.fn().mockResolvedValue(undefined),
  loadPendingTransfers: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/db/incomeRepository', () => ({
  insertIncome: jest.fn().mockResolvedValue(undefined),
  softDeleteIncomeInDb: jest.fn().mockResolvedValue(undefined),
  moveIncomeAccountInDb: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/api', () => ({
  api: {
    createAccountTransfer: jest.fn(),
    updateAccountTransfer: jest.fn(),
    deleteAccountTransfer: jest.fn(),
  },
}));

jest.mock('../authStore', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1' } }) },
}));

const mockLoadIncomes = jest.fn().mockResolvedValue(undefined);
jest.mock('../incomeStore', () => ({
  useIncomeStore: { getState: () => ({ loadIncomes: mockLoadIncomes }) },
}));

import type { AccountTransfer } from '@budget/shared-types';
import {
  addTransferAction,
  updateTransferAction,
  syncPendingTransfersAction,
} from '../accountTransferActions';
import {
  updateTransferInDb,
  setTransferServerId,
  setTransferSyncStatus,
  loadPendingTransfers,
} from '@/db/accountTransferRepository';
import { moveIncomeAccountInDb } from '@/db/incomeRepository';
import { api } from '@/services/api';

const EXISTING: AccountTransfer = {
  id: 'local-1',
  localId: 'local-1',
  serverId: 'srv-1',
  userId: 'u1',
  fromAccountId: 'micode',
  fromCurrency: 'PLN',
  fromAmount: 6000,
  toAccountId: 'family',
  toCurrency: 'PLN',
  toAmount: 6000,
  exchangeRate: 1,
  date: new Date('2026-09-01'),
  notes: 'Misha',
  countAsIncome: true,
  linkedIncomeId: 'inc-server-1',
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
  isDeleted: false,
  syncStatus: 'synced',
  syncVersion: 0,
};

function makeStore(transfers: AccountTransfer[]) {
  let state: { transfers: AccountTransfer[]; walletSummary: unknown[] } = {
    transfers,
    walletSummary: [],
  };
  const set = (updater: any) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...patch };
  };
  const get = () => ({ ...state, computeWalletSummary: async () => [] }) as any;
  return { set: set as any, get, current: () => state };
}

beforeEach(() => jest.clearAllMocks());

describe('updateTransferAction', () => {
  it('rolls the edit back and reports failure when the server refuses it', async () => {
    const store = makeStore([{ ...EXISTING }]);
    (api.updateAccountTransfer as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Current account must be a party to the transfer'), {
        status: 403,
      }),
    );

    const result = await updateTransferAction(store.set, store.get, 'local-1', {
      toAccountId: 'house',
    });

    expect(result).toEqual({ status: 'rejected' });
    // In memory: exactly as it was, including syncStatus.
    expect(store.current().transfers[0]).toEqual(EXISTING);
    // On disk: the last write restores the old destination and the old sync state,
    // so the row can't sit locally claiming an edit the server never took.
    expect(updateTransferInDb).toHaveBeenLastCalledWith(
      'local-1',
      { toAccountId: 'family' },
      EXISTING.updatedAt,
      'synced',
    );
    // The money must not move when the edit did not.
    expect(moveIncomeAccountInDb).not.toHaveBeenCalled();
  });

  it('keeps an offline edit queued instead of rolling it back', async () => {
    // A transport failure is worth retrying, so the edit stays applied and pending
    // and syncPendingTransfers pushes it later — rolling it back here would make the
    // app unusable offline, and leaving it applied is only safe because the wallet
    // pull now skips pending rows.
    const store = makeStore([{ ...EXISTING }]);
    (api.updateAccountTransfer as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    const result = await updateTransferAction(store.set, store.get, 'local-1', {
      toAccountId: 'house',
    });

    expect(result).toEqual({ status: 'queued' });
    expect(store.current().transfers[0].toAccountId).toBe('house');
    expect(store.current().transfers[0].syncStatus).toBe('pending');
    // Only the optimistic write happened — nothing rolled anything back.
    expect(updateTransferInDb).toHaveBeenCalledTimes(1);
    expect(updateTransferInDb).toHaveBeenLastCalledWith(
      'local-1',
      { toAccountId: 'house' },
      expect.any(Date),
      'pending',
    );
  });

  it('re-homes the linked income locally once the server accepts the new destination', async () => {
    const store = makeStore([{ ...EXISTING }]);
    (api.updateAccountTransfer as jest.Mock).mockResolvedValue({});

    const result = await updateTransferAction(store.set, store.get, 'local-1', {
      toAccountId: 'house',
      toCurrency: 'PLN',
    });

    expect(result).toEqual({ status: 'saved' });
    expect(store.current().transfers[0].toAccountId).toBe('house');
    expect(store.current().transfers[0].syncStatus).toBe('synced');
    // The local income row is keyed by the transfer's clientId, not its server id.
    expect(moveIncomeAccountInDb).toHaveBeenCalledWith('transfer-income-local-1', 'house');
    expect(mockLoadIncomes).toHaveBeenCalledWith({ force: true });
  });

  it('leaves the linked income alone when the destination did not change', async () => {
    const store = makeStore([{ ...EXISTING }]);
    (api.updateAccountTransfer as jest.Mock).mockResolvedValue({});

    await updateTransferAction(store.set, store.get, 'local-1', { fromAmount: 6500 });

    expect(moveIncomeAccountInDb).not.toHaveBeenCalled();
  });

  it('addresses the server row by its local id while serverId is still unknown', async () => {
    const store = makeStore([{ ...EXISTING, serverId: undefined }]);
    (api.updateAccountTransfer as jest.Mock).mockResolvedValue({});

    await updateTransferAction(store.set, store.get, 'local-1', { fromAmount: 6500 });

    // The server resolves this against clientId; before that fix it 404'd silently.
    expect(api.updateAccountTransfer).toHaveBeenCalledWith('local-1', expect.anything());
  });
});

describe('addTransferAction', () => {
  it('records the server id the create returned', async () => {
    const store = makeStore([]);
    (api.createAccountTransfer as jest.Mock).mockResolvedValue({ id: 'srv-new' });

    const created = addTransferAction(store.set, store.get, {
      fromAccountId: 'micode',
      fromCurrency: 'PLN',
      fromAmount: 6000,
      toAccountId: 'family',
      toCurrency: 'PLN',
      toAmount: 6000,
      exchangeRate: 1,
      date: new Date('2026-09-01'),
      countAsIncome: true,
    });

    await new Promise((r) => setImmediate(r));

    expect(setTransferServerId).toHaveBeenCalledWith(created.id, 'srv-new');
    expect(store.current().transfers[0].serverId).toBe('srv-new');
  });
});

describe('syncPendingTransfersAction', () => {
  const pending = (over: Partial<AccountTransfer> = {}): AccountTransfer => ({
    ...EXISTING,
    serverId: undefined,
    syncStatus: 'pending',
    ...over,
  });

  it('creates a queued transfer and stores the server id', async () => {
    const row = pending();
    (loadPendingTransfers as jest.Mock).mockResolvedValue([row]);
    (api.createAccountTransfer as jest.Mock).mockResolvedValue({ id: 'srv-queued' });
    const store = makeStore([row]);

    await syncPendingTransfersAction(store.set, store.get, 'micode');

    expect(api.createAccountTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ localId: 'local-1', fromAccountId: 'micode' }),
    );
    expect(setTransferServerId).toHaveBeenCalledWith('local-1', 'srv-queued');
    expect(setTransferSyncStatus).toHaveBeenCalledWith('local-1', 'synced');
  });

  it('pushes a queued edit as an update once the server id is known', async () => {
    (loadPendingTransfers as jest.Mock).mockResolvedValue([pending({ serverId: 'srv-1' })]);
    (api.updateAccountTransfer as jest.Mock).mockResolvedValue({});
    const store = makeStore([]);

    await syncPendingTransfersAction(store.set, store.get, 'micode');

    expect(api.createAccountTransfer).not.toHaveBeenCalled();
    expect(api.updateAccountTransfer).toHaveBeenCalledWith('srv-1', expect.anything());
    expect(setTransferSyncStatus).toHaveBeenCalledWith('local-1', 'synced');
  });

  it('pushes a queued delete, and treats an already-gone row as done', async () => {
    (loadPendingTransfers as jest.Mock).mockResolvedValue([
      pending({ serverId: 'srv-1', isDeleted: true }),
    ]);
    (api.deleteAccountTransfer as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Transfer not found'), { status: 404 }),
    );
    const store = makeStore([]);

    await syncPendingTransfersAction(store.set, store.get, 'micode');

    expect(api.deleteAccountTransfer).toHaveBeenCalledWith('srv-1');
    expect(setTransferSyncStatus).toHaveBeenCalledWith('local-1', 'synced');
  });

  it('gives up on a row the server refuses, so it stops blocking the queue', async () => {
    // `error` also drops it out of the pull's pending-guard, letting the server's
    // truth overwrite a local row nothing will ever accept.
    (loadPendingTransfers as jest.Mock).mockResolvedValue([pending({ serverId: 'srv-1' })]);
    (api.updateAccountTransfer as jest.Mock).mockRejectedValue(
      Object.assign(new Error('You must be a member of both accounts'), { status: 403 }),
    );
    const store = makeStore([]);

    await syncPendingTransfersAction(store.set, store.get, 'micode');

    expect(setTransferSyncStatus).toHaveBeenCalledWith('local-1', 'error');
  });

  it('stops at the first transport failure and leaves the rest queued', async () => {
    (loadPendingTransfers as jest.Mock).mockResolvedValue([
      pending({ id: 'a', localId: 'a', serverId: 'srv-a' }),
      pending({ id: 'b', localId: 'b', serverId: 'srv-b' }),
    ]);
    (api.updateAccountTransfer as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    const store = makeStore([]);

    await syncPendingTransfersAction(store.set, store.get, 'micode');

    expect(api.updateAccountTransfer).toHaveBeenCalledTimes(1);
    expect(setTransferSyncStatus).not.toHaveBeenCalled();
  });
});
