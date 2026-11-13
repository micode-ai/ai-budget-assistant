/**
 * ABA-754 — the income offline retry, the mirror of ABA-749's expense one.
 * - A push marks the row synced only when the server acknowledged it (or refused
 *   it with a 4xx); a transport failure, 5xx or 429 leaves it pending.
 * - A delete made offline stays pending in SQLite and is resent until the server
 *   confirms it (or no longer has the income); the pull does not re-insert it.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('@/db/incomeRepository', () => ({
  loadAllIncomes: jest.fn().mockResolvedValue([]),
  insertIncome: jest.fn().mockResolvedValue(undefined),
  upsertIncome: jest.fn().mockResolvedValue(undefined),
  updateIncomeInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteIncomeInDb: jest.fn().mockResolvedValue(undefined),
  setIncomeChildBenefit: jest.fn().mockResolvedValue(undefined),
  loadPendingIncomeDeleteIds: jest.fn().mockResolvedValue([]),
  markIncomeDeleteSynced: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/tagRepository', () => ({
  insertIncomeTag: jest.fn().mockResolvedValue(undefined),
  getTagsForIncome: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/db/categoryRepository', () => ({
  getCategoryById: jest.fn().mockResolvedValue(null),
  upsertCategory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/syncMetadataRepository', () => ({
  setLastSyncTime: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/client', () => ({
  withTransaction: jest.fn((fn: () => Promise<void>) => fn()),
}));

jest.mock('@/services/api', () => ({
  api: {
    getIncomes: jest.fn().mockResolvedValue({ data: [] }),
    createIncome: jest.fn().mockResolvedValue({ id: 'srv-1' }),
    deleteIncome: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(async (_t: string, data: Record<string, unknown>) => ({
    payload: data,
    encryptedPayload: undefined,
    encryptionKeyVersion: undefined,
  })),
  maybeDecrypt: jest.fn(async (_t: string, x: unknown) => x),
}));

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: 'acc-1', canEdit: () => true })) },
}));

jest.mock('@/stores/categoryStore', () => ({
  useCategoryStore: { getState: jest.fn(() => ({ loadCategories: jest.fn().mockResolvedValue(undefined) })) },
}));

jest.mock('@/stores/gamificationStore', () => ({
  useGamificationStore: { getState: jest.fn(() => ({})) },
}));

jest.mock('@/stores/childStore', () => ({
  serverChildRef: jest.fn().mockResolvedValue(null),
  useChildStore: { getState: jest.fn(() => ({ resolveServerChildIds: jest.fn().mockResolvedValue(new Map()) })) },
}));

import { useIncomeStore } from '../incomeStore';
import { syncPendingIncomeDeletes } from '../incomeSync';
import { api } from '@/services/api';
import * as repo from '@/db/incomeRepository';

const mockApi = api as jest.Mocked<typeof api>;
const mockRepo = repo as jest.Mocked<typeof repo>;

function pendingIncome(over: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    localId: 'inc-1',
    accountId: 'acc-1',
    amount: 100,
    currencyCode: 'PLN',
    date: new Date('2026-01-01T00:00:00.000Z'),
    source: 'manual',
    syncStatus: 'pending',
    isDeleted: false,
    ...over,
  } as any;
}

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  useIncomeStore.getState().reset();
});

describe('syncPendingIncomes — a push is synced only when acknowledged', () => {
  it('leaves the row pending when the server is unreachable', async () => {
    mockApi.createIncome.mockRejectedValueOnce(new TypeError('Network request failed'));
    useIncomeStore.setState({ incomes: [pendingIncome()] });

    await useIncomeStore.getState().syncPendingIncomes();

    expect(useIncomeStore.getState().incomes[0].syncStatus).toBe('pending');
    expect(mockRepo.updateIncomeInDb).not.toHaveBeenCalled();
  });

  it.each([500, 503, 429, 408])('leaves the row pending on HTTP %i', async (status) => {
    mockApi.createIncome.mockRejectedValueOnce(httpError(status));
    useIncomeStore.setState({ incomes: [pendingIncome()] });

    await useIncomeStore.getState().syncPendingIncomes();

    expect(useIncomeStore.getState().incomes[0].syncStatus).toBe('pending');
  });

  it('lets a 4xx refusal go, since no retry would change it', async () => {
    mockApi.createIncome.mockRejectedValueOnce(httpError(400));
    useIncomeStore.setState({ incomes: [pendingIncome()] });

    await useIncomeStore.getState().syncPendingIncomes();

    expect(useIncomeStore.getState().incomes[0].syncStatus).toBe('synced');
    expect(mockRepo.updateIncomeInDb).toHaveBeenCalledWith('inc-1', {}, expect.any(Date), 'synced');
  });

  it('marks an acknowledged push synced', async () => {
    useIncomeStore.setState({ incomes: [pendingIncome()] });

    await useIncomeStore.getState().syncPendingIncomes();

    expect(mockApi.createIncome).toHaveBeenCalledTimes(1);
    expect(useIncomeStore.getState().incomes[0].syncStatus).toBe('synced');
  });

  it('resends pending deletes even when no create is pending', async () => {
    mockRepo.loadPendingIncomeDeleteIds.mockResolvedValueOnce(['gone-1']);

    await useIncomeStore.getState().syncPendingIncomes();

    expect(mockApi.deleteIncome).toHaveBeenCalledWith('gone-1');
    expect(mockRepo.markIncomeDeleteSynced).toHaveBeenCalledWith('gone-1');
  });
});

describe('syncPendingIncomeDeletes', () => {
  it('bounds one pass and reads only the current account', async () => {
    await syncPendingIncomeDeletes();
    expect(mockRepo.loadPendingIncomeDeleteIds).toHaveBeenCalledWith('acc-1', 20);
  });

  it('counts a 404 as done and keeps any other failure pending', async () => {
    mockRepo.loadPendingIncomeDeleteIds.mockResolvedValueOnce(['a', 'b', 'c']);
    mockApi.deleteIncome
      .mockRejectedValueOnce(httpError(404))
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce(undefined as never);

    await syncPendingIncomeDeletes();

    expect(mockRepo.markIncomeDeleteSynced).toHaveBeenCalledWith('a');
    expect(mockRepo.markIncomeDeleteSynced).not.toHaveBeenCalledWith('b');
    expect(mockRepo.markIncomeDeleteSynced).toHaveBeenCalledWith('c');
  });
});

describe('deleteIncome', () => {
  it('marks the delete synced once the server acknowledges it', async () => {
    useIncomeStore.setState({ incomes: [pendingIncome({ syncStatus: 'synced' })] });

    useIncomeStore.getState().deleteIncome('inc-1');
    await flush();

    expect(mockRepo.softDeleteIncomeInDb).toHaveBeenCalledWith('inc-1', expect.any(Date));
    expect(mockRepo.markIncomeDeleteSynced).toHaveBeenCalledWith('inc-1');
  });

  it('leaves it pending for the resend when offline', async () => {
    mockApi.deleteIncome.mockRejectedValueOnce(new TypeError('Network request failed'));
    useIncomeStore.setState({ incomes: [pendingIncome({ syncStatus: 'synced' })] });

    useIncomeStore.getState().deleteIncome('inc-1');
    await flush();

    expect(mockRepo.markIncomeDeleteSynced).not.toHaveBeenCalled();
  });
});

describe('the pull and pending deletes', () => {
  it('does not re-insert an income whose delete has not reached the server', async () => {
    mockRepo.loadPendingIncomeDeleteIds.mockResolvedValue(['inc-del']);
    mockApi.getIncomes.mockResolvedValueOnce({
      data: [
        { id: 'srv-del', clientId: 'inc-del', accountId: 'acc-1', amount: 5, currencyCode: 'PLN', date: '2026-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'srv-keep', clientId: 'inc-keep', accountId: 'acc-1', amount: 7, currencyCode: 'PLN', date: '2026-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
    } as never);

    await useIncomeStore.getState().loadIncomes({ force: true });

    const upserted = mockRepo.upsertIncome.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(upserted).toEqual(['inc-keep']);
    mockRepo.loadPendingIncomeDeleteIds.mockResolvedValue([]);
  });

  it('marks a row the server no longer returns as an already-synced delete', async () => {
    mockRepo.loadAllIncomes.mockResolvedValueOnce([pendingIncome({ id: 'inc-old', syncStatus: 'synced' })]);
    mockApi.getIncomes.mockResolvedValueOnce({ data: [] } as never);

    await useIncomeStore.getState().loadIncomes({ force: true });

    expect(mockRepo.softDeleteIncomeInDb).toHaveBeenCalledWith('inc-old', expect.any(Date), 'synced');
  });
});
