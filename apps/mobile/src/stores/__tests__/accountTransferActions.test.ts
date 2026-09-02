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
import { addTransferAction, updateTransferAction } from '../accountTransferActions';
import {
  updateTransferInDb,
  setTransferServerId,
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

    expect(result).toEqual({ ok: false });
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

  it('re-homes the linked income locally once the server accepts the new destination', async () => {
    const store = makeStore([{ ...EXISTING }]);
    (api.updateAccountTransfer as jest.Mock).mockResolvedValue({});

    const result = await updateTransferAction(store.set, store.get, 'local-1', {
      toAccountId: 'house',
      toCurrency: 'PLN',
    });

    expect(result).toEqual({ ok: true });
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
