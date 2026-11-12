/**
 * childStore + childSync — the child-costs data layer on the device.
 *
 * Offline-first on native: every write lands in SQLite and in the sync queue
 * before anything touches the network, and the local child id IS the
 * clientId the server learns. The queue drain must push a child before any
 * link that references it, and must never send a plaintext child name on an
 * encrypted account.
 */
import type { Child } from '@budget/shared-types';

import { useChildStore } from '../childStore';
import {
  countStatementQueue,
  drainChildQueue,
  mergeServerChildAttribution,
  UNDELIVERABLE_LINE_TTL_MS,
  resetChildSyncState,
  type QueuedChildChange,
} from '../childSync';
import * as childRepository from '../../db/childRepository';
import * as expenseItemRepository from '../../db/expenseItemRepository';
import { api } from '../../services/api';
import * as encryptionHelper from '../../services/encryptionHelper';
import { useExpenseStore } from '../expenseStore';

jest.mock('../../db/childRepository', () => ({
  getChildren: jest.fn(),
  upsertChild: jest.fn(),
  getChildServerIdMap: jest.fn(),
  getChildRecords: jest.fn(),
  markChildSynced: jest.fn(),
  softDeleteChildLocally: jest.fn(),
  getExpenseChildLinks: jest.fn(),
  getLinksForExpense: jest.fn(),
  replaceExpenseChildLinks: jest.fn(),
  enqueueChildChange: jest.fn(),
  getQueuedChildChanges: jest.fn(),
  getPendingAttributionExpenseIds: jest.fn(),
  deleteQueuedChildChanges: jest.fn(),
  recordChildQueueFailure: jest.fn(),
  getChildServerIds: jest.fn(),
  getUnsyncedExpenseIds: jest.fn(),
  getUnsyncedItemIds: jest.fn(),
  markLinesUndeliverable: jest.fn(),
  UNDELIVERABLE_LINE_ERROR: 'line not on server',
}));

jest.mock('../../db/expenseItemRepository', () => ({
  setExpenseItemChild: jest.fn(),
  clearExpenseItemChildren: jest.fn(),
  getAttributedItems: jest.fn(),
}));

jest.mock('../../db/client', () => ({
  executeSql: jest.fn(),
  withTransaction: (task: () => Promise<void>) => task(),
}));

jest.mock('../../services/api', () => ({
  api: {
    getChildren: jest.fn(),
    createChild: jest.fn(),
    updateChild: jest.fn(),
    setExpenseChildren: jest.fn(),
    setItemChild: jest.fn(),
    pushChanges: jest.fn(),
    getAccountEncryptionStatus: jest.fn(),
  },
}));

jest.mock('../../services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(),
  maybeDecrypt: jest.fn(async (_t: string, data: Record<string, unknown>) => data),
}));

jest.mock('../accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccountId: mockCurrentAccount }) },
}));

const mockExpenseItems: Record<string, { id: string; childId?: string | null; isDeleted?: boolean }[]> = {};
jest.mock('../expenseStore', () => ({
  useExpenseStore: { setState: jest.fn(), getState: () => ({ expenseItems: mockExpenseItems }) },
}));

let mockUuid = 0;
let mockCurrentAccount = 'acc-1';
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }));

const mockRepo = childRepository as unknown as Record<keyof typeof childRepository, jest.Mock>;
const mockItemRepo = expenseItemRepository as unknown as Record<keyof typeof expenseItemRepository, jest.Mock>;
const mockApi = api as unknown as Record<string, jest.Mock>;
const mockMaybeEncrypt = encryptionHelper.maybeEncrypt as unknown as jest.Mock;
const mockExpenseSetState = useExpenseStore.setState as unknown as jest.Mock;


function q(
  id: string,
  entityType: QueuedChildChange['entityType'],
  entityId: string,
  operation: QueuedChildChange['operation'],
  payload: Record<string, unknown>,
): QueuedChildChange {
  return { id, entityType, entityId, operation, payload, accountId: 'acc-1', attempts: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid = 0;
  const mocks = (o: object) => Object.values(o).filter((v): v is jest.Mock => jest.isMockFunction(v));
  for (const fn of mocks(mockRepo)) fn.mockResolvedValue(undefined);
  for (const fn of mocks(mockItemRepo)) fn.mockResolvedValue(undefined);
  for (const fn of mocks(mockApi)) fn.mockReset();
  mockRepo.getChildRecords.mockResolvedValue([]);
  mockRepo.getExpenseChildLinks.mockResolvedValue([]);
  mockRepo.getPendingAttributionExpenseIds.mockResolvedValue(new Set());
  mockRepo.getChildServerIds.mockResolvedValue(new Map());
  mockRepo.getUnsyncedExpenseIds.mockResolvedValue(new Set());
  mockRepo.getUnsyncedItemIds.mockResolvedValue(new Set());
  mockCurrentAccount = 'acc-1';
  mockItemRepo.getAttributedItems.mockResolvedValue([]);
  mockRepo.getChildren.mockResolvedValue([]);
  mockRepo.getChildServerIdMap.mockResolvedValue(new Map());
  mockRepo.getQueuedChildChanges.mockResolvedValue([]);
  mockRepo.getLinksForExpense.mockResolvedValue([]);
  mockItemRepo.clearExpenseItemChildren.mockResolvedValue([]);
  mockApi.getChildren.mockResolvedValue([]);
  mockApi.getAccountEncryptionStatus.mockResolvedValue({ encryptionTier: 0 });
  mockMaybeEncrypt.mockImplementation(async (_t: string, data: Record<string, unknown>) => ({ payload: data }));
  resetChildSyncState();
  useChildStore.getState().reset();
});

describe('childStore — offline-first writes', () => {
  it('createChild writes SQLite then enqueues a child change with clientId = local id', async () => {
    const order: string[] = [];
    mockRepo.upsertChild.mockImplementationOnce(async () => { order.push('sqlite'); });
    mockRepo.enqueueChildChange.mockImplementationOnce(async () => { order.push('queue'); });

    const child = await useChildStore.getState().createChild('  Ala ', '#ff0000');

    expect(child.id).toBe('uuid-1');
    expect(child.clientId).toBe('uuid-1');
    expect(child.name).toBe('Ala');
    expect(order).toEqual(['sqlite', 'queue']);
    expect(mockRepo.upsertChild).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'uuid-1', accountId: 'acc-1', name: 'Ala', syncStatus: 'pending', serverId: null }),
    );
    expect(mockRepo.enqueueChildChange).toHaveBeenCalledWith({
      entityType: 'child',
      entityId: 'uuid-1',
      operation: 'create',
      payload: { name: 'Ala', color: '#ff0000', clientId: 'uuid-1', archivedAt: null },
      accountId: 'acc-1',
    });
    expect(useChildStore.getState().children.map((c: Child) => c.id)).toEqual(['uuid-1']);
  });

  it('setChildColor writes the colour locally and enqueues a full update snapshot', async () => {
    await useChildStore.getState().createChild('Ala', '#ff0000');
    mockRepo.enqueueChildChange.mockClear();

    await useChildStore.getState().setChildColor('uuid-1', '#00ff00');

    expect(mockRepo.enqueueChildChange).toHaveBeenCalledWith({
      entityType: 'child',
      entityId: 'uuid-1',
      operation: 'update',
      payload: { name: 'Ala', color: '#00ff00', archivedAt: null },
      accountId: 'acc-1',
    });
    expect(useChildStore.getState().children[0].color).toBe('#00ff00');
  });

  it('createChild rejects an empty name and a name over 40 characters', async () => {
    await expect(useChildStore.getState().createChild('   ')).rejects.toThrow();
    await expect(useChildStore.getState().createChild('x'.repeat(41))).rejects.toThrow();
    expect(mockRepo.upsertChild).not.toHaveBeenCalled();
  });

  it('setItemChild on an expense with links soft-deletes the links locally and enqueues both changes in order (links first)', async () => {
    mockRepo.getLinksForExpense.mockResolvedValue([
      { expenseId: 'e-1', childId: 'c-1', share: 0.5 },
      { expenseId: 'e-1', childId: 'c-2', share: 0.5 },
    ]);

    await useChildStore.getState().setItemChild('e-1', 'i-1', 'c-3');

    expect(mockRepo.replaceExpenseChildLinks).toHaveBeenCalledWith('e-1', []);
    expect(mockItemRepo.setExpenseItemChild).toHaveBeenCalledWith('i-1', 'c-3');
    const enqueued = mockRepo.enqueueChildChange.mock.calls.map((c) => c[0]);
    expect(enqueued.map((e) => `${e.entityType}:${e.operation}`)).toEqual([
      'expense_child:delete',
      'expense_child:delete',
      'expense_item_child:update',
    ]);
    expect(enqueued[0].payload).toEqual({ expenseId: 'e-1', childId: 'c-1', share: 0.5 });
    expect(enqueued[2].payload).toEqual({ expenseId: 'e-1', itemId: 'i-1', childId: 'c-3' });
    // In-memory expense loses its whole-expense links too.
    expect(mockExpenseSetState).toHaveBeenCalled();
  });

  it('setItemChild reflects the line child on the in-memory receipt lines', async () => {
    mockRepo.getLinksForExpense.mockResolvedValue([]);
    mockExpenseItems['e-1'] = [{ id: 'i-1', childId: null }, { id: 'i-2', childId: null }];
    mockExpenseSetState.mockClear();

    await useChildStore.getState().setItemChild('e-1', 'i-1', 'c-3');

    const itemsPatch = mockExpenseSetState.mock.calls
      .map((c) => c[0])
      .map((fn) => (typeof fn === 'function' ? fn({ expenseItems: mockExpenseItems, expenses: [] }) : fn))
      .find((patch) => patch.expenseItems);
    expect(itemsPatch.expenseItems['e-1']).toEqual([
      { id: 'i-1', childId: 'c-3' },
      { id: 'i-2', childId: null },
    ]);
    delete mockExpenseItems['e-1'];
  });

  it('setItemChild(null) clears only the line and leaves the links', async () => {
    mockRepo.getLinksForExpense.mockResolvedValue([{ expenseId: 'e-1', childId: 'c-1', share: 1 }]);
    await useChildStore.getState().setItemChild('e-1', 'i-1', null);
    expect(mockRepo.replaceExpenseChildLinks).not.toHaveBeenCalled();
    const enqueued = mockRepo.enqueueChildChange.mock.calls.map((c) => c[0]);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].payload).toEqual({ expenseId: 'e-1', itemId: 'i-1', childId: null });
  });

  it('setExpenseChildren clears item childIds and enqueues', async () => {
    mockItemRepo.clearExpenseItemChildren.mockResolvedValue(['i-1', 'i-2']);
    mockRepo.getLinksForExpense.mockResolvedValue([{ expenseId: 'e-1', childId: 'c-old', share: 1 }]);

    await useChildStore.getState().setExpenseChildren('e-1', ['c-1', 'c-2', 'c-3']);

    expect(mockItemRepo.clearExpenseItemChildren).toHaveBeenCalledWith('e-1');
    expect(mockRepo.replaceExpenseChildLinks).toHaveBeenCalledWith('e-1', [
      { childId: 'c-1', share: 0.3334 },
      { childId: 'c-2', share: 0.3333 },
      { childId: 'c-3', share: 0.3333 },
    ]);
    const enqueued = mockRepo.enqueueChildChange.mock.calls.map((c) => c[0]);
    expect(enqueued.map((e) => `${e.entityType}:${e.operation}:${e.entityId}`)).toEqual([
      'expense_item_child:update:i-1',
      'expense_item_child:update:i-2',
      'expense_child:delete:e-1:c-old',
      'expense_child:create:e-1:c-1',
      'expense_child:create:e-1:c-2',
      'expense_child:create:e-1:c-3',
    ]);
    expect(enqueued[0].payload).toEqual({ expenseId: 'e-1', itemId: 'i-1', childId: null });
  });

  it('setExpenseChildren([]) removes the links and leaves line attribution alone', async () => {
    mockRepo.getLinksForExpense.mockResolvedValue([{ expenseId: 'e-1', childId: 'c-1', share: 1 }]);
    await useChildStore.getState().setExpenseChildren('e-1', []);
    expect(mockItemRepo.clearExpenseItemChildren).not.toHaveBeenCalled();
    expect(mockRepo.replaceExpenseChildLinks).toHaveBeenCalledWith('e-1', []);
  });

  it('setExpenseChildren rejects shares that do not sum to 1', async () => {
    await expect(useChildStore.getState().setExpenseChildren('e-1', ['c-1', 'c-2'], [0.5, 0.2])).rejects.toThrow();
    expect(mockRepo.replaceExpenseChildLinks).not.toHaveBeenCalled();
  });

  it('reset clears children', async () => {
    await useChildStore.getState().createChild('Ala');
    expect(useChildStore.getState().children).toHaveLength(1);
    useChildStore.getState().reset();
    expect(useChildStore.getState().children).toEqual([]);
    expect(useChildStore.getState().isLoaded).toBe(false);
  });
});

describe('childStore — pull', () => {
  it('syncFromServer adopts clientId ?? id as the local id and records the server PK', async () => {
    mockApi.getChildren.mockResolvedValue([
      { id: 'srv-1', clientId: 'local-1', accountId: 'acc-1', name: 'Ala', archivedAt: null },
      { id: 'srv-2', accountId: 'acc-1', name: 'Olek', archivedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    mockRepo.getChildren.mockResolvedValue([
      { id: 'local-1', clientId: 'local-1', accountId: 'acc-1', name: 'Ala', archivedAt: null },
      { id: 'srv-2', clientId: 'srv-2', accountId: 'acc-1', name: 'Olek', archivedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    await useChildStore.getState().syncFromServer();

    expect(mockApi.getChildren).toHaveBeenCalledWith(true);
    expect(mockRepo.upsertChild).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-1', serverId: 'srv-1', syncStatus: 'synced' }),
    );
    expect(mockRepo.upsertChild).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'srv-2', serverId: 'srv-2', syncStatus: 'synced' }),
    );
    expect(useChildStore.getState().children).toHaveLength(2);
    expect(useChildStore.getState().isLoaded).toBe(true);
    const map = await useChildStore.getState().resolveServerChildIds(['srv-1', 'srv-2']);
    expect(map.get('srv-1')).toBe('local-1');
    expect(map.get('srv-2')).toBe('srv-2');
  });

  it('a failed pull keeps the previous children and is not reported as loaded', async () => {
    mockApi.getChildren.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await useChildStore.getState().syncFromServer();
    expect(useChildStore.getState().isLoaded).toBe(false);
    expect(useChildStore.getState().error).toBeTruthy();
    warn.mockRestore();
  });
});

describe('childSync — queue drain', () => {
  const ok = (n: number) => ({
    results: Array.from({ length: n }, (_, i) => ({ entityId: `x${i}`, status: 'success', serverId: `srv-${i}` })),
    serverTimestamp: '',
    summary: { success: n, conflicts: 0, errors: 0 },
  });

  it('pushes children in their own request before any link that references them', async () => {
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'child', 'c-1', 'create', { name: 'Ala', clientId: 'c-1', archivedAt: null }),
      q('q2', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
    ]);
    mockApi.pushChanges.mockImplementation(async (changes: unknown[]) => ok(changes.length));

    await drainChildQueue('acc-1');

    expect(mockApi.pushChanges).toHaveBeenCalledTimes(2);
    const first = mockApi.pushChanges.mock.calls[0][0];
    const second = mockApi.pushChanges.mock.calls[1][0];
    expect(first.map((c: { entityType: string }) => c.entityType)).toEqual(['child']);
    expect(first[0]).toEqual(expect.objectContaining({
      entityId: 'c-1', operation: 'create', accountId: 'acc-1',
      payload: expect.objectContaining({ name: 'Ala', clientId: 'c-1' }),
    }));
    expect(second.map((c: { entityType: string }) => c.entityType)).toEqual(['expense_child']);
    expect(mockRepo.markChildSynced).toHaveBeenCalledWith('c-1', 'srv-0');
    expect(mockRepo.deleteQueuedChildChanges).toHaveBeenCalledWith(['q1']);
    expect(mockRepo.deleteQueuedChildChanges).toHaveBeenCalledWith(['q2']);
  });

  it('holds back links whose child create failed', async () => {
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'child', 'c-1', 'create', { name: 'Ala', clientId: 'c-1', archivedAt: null }),
      q('q2', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
    ]);
    mockApi.pushChanges.mockResolvedValue({
      results: [{ entityId: 'c-1', status: 'error', error: 'boom' }],
      serverTimestamp: '',
      summary: { success: 0, conflicts: 0, errors: 1 },
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    await drainChildQueue('acc-1');

    expect(mockApi.pushChanges).toHaveBeenCalledTimes(1);
    expect(mockRepo.recordChildQueueFailure).toHaveBeenCalledWith(['q1'], 'boom');
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it('never sends the plaintext name on an encrypted account', async () => {
    mockApi.getAccountEncryptionStatus.mockResolvedValue({ encryptionTier: 1 });
    mockMaybeEncrypt.mockImplementation(async () => ({
      payload: { name: null },
      encryptedPayload: '{"v":1}',
      encryptionKeyVersion: 3,
    }) as never);
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'child', 'c-1', 'create', { name: 'Ala', clientId: 'c-1', archivedAt: null }),
    ]);
    mockApi.pushChanges.mockImplementation(async (changes: unknown[]) => ok(changes.length));

    await drainChildQueue('acc-1');

    const [change] = mockApi.pushChanges.mock.calls[0][0];
    expect(change.payload.name).toBeNull();
    expect(change.encryptedPayload).toBe('{"v":1}');
    expect(change.encryptionKeyVersion).toBe(3);
    expect(JSON.stringify(change)).not.toContain('Ala');
  });

  it('keeps the queue when an encrypted account cannot encrypt (locked key)', async () => {
    mockApi.getAccountEncryptionStatus.mockResolvedValue({ encryptionTier: 2 });
    // maybeEncrypt returns the data unchanged when the key is not unlocked.
    mockMaybeEncrypt.mockImplementation(async (_t: string, data: Record<string, unknown>) => ({ payload: data }));
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'child', 'c-1', 'create', { name: 'Ala', clientId: 'c-1', archivedAt: null }),
      q('q2', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
    ]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await drainChildQueue('acc-1');

    expect(mockApi.pushChanges).not.toHaveBeenCalled();
    expect(mockRepo.deleteQueuedChildChanges).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not push anything when the encryption tier cannot be read', async () => {
    mockApi.getAccountEncryptionStatus.mockRejectedValue(new Error('offline'));
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'child', 'c-1', 'create', { name: 'Ala', clientId: 'c-1', archivedAt: null }),
    ]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await drainChildQueue('acc-1');
    expect(mockApi.pushChanges).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('replays link and line changes in queue order, coalescing each row to its last change', async () => {
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
      q('q2', 'expense_child', 'e-1:c-1', 'delete', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
      q('q3', 'expense_item_child', 'i-1', 'update', { expenseId: 'e-1', itemId: 'i-1', childId: 'c-2' }),
    ]);
    const order: string[] = [];
    mockApi.pushChanges.mockImplementation(async (changes: { operation: string }[]) => {
      order.push(`push:${changes.map((c) => c.operation).join(',')}`);
      return ok(changes.length);
    });
    mockApi.setItemChild.mockImplementation(async () => { order.push('item'); });

    await drainChildQueue('acc-1');

    // The create was superseded by the delete: only the delete is sent, and before the line.
    expect(order).toEqual(['push:delete', 'item']);
    expect(mockApi.setItemChild).toHaveBeenCalledWith('e-1', 'i-1', 'c-2', { accountId: 'acc-1' });
    expect(mockRepo.deleteQueuedChildChanges).toHaveBeenCalledWith(['q1', 'q2']);
    expect(mockRepo.deleteQueuedChildChanges).toHaveBeenCalledWith(['q3']);
  });

  it('a network failure stops the drain and keeps the rows', async () => {
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
      q('q2', 'expense_item_child', 'i-1', 'update', { expenseId: 'e-1', itemId: 'i-1', childId: null }),
    ]);
    mockApi.pushChanges.mockRejectedValue(new TypeError('Failed to fetch'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    await drainChildQueue('acc-1');

    expect(mockApi.setItemChild).not.toHaveBeenCalled();
    expect(mockRepo.deleteQueuedChildChanges).not.toHaveBeenCalled();
    expect(mockRepo.recordChildQueueFailure).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it('a failed line change for an expense holds back later changes for the same expense', async () => {
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'expense_item_child', 'i-1', 'update', { expenseId: 'e-1', itemId: 'i-1', childId: 'c-1' }),
      q('q2', 'expense_child', 'e-1:c-2', 'create', { expenseId: 'e-1', childId: 'c-2', share: 1 }),
      q('q3', 'expense_child', 'e-2:c-2', 'create', { expenseId: 'e-2', childId: 'c-2', share: 1 }),
    ]);
    mockApi.setItemChild.mockRejectedValue(Object.assign(new Error('Expense item not found'), { status: 404 }));
    mockApi.pushChanges.mockImplementation(async (changes: unknown[]) => ok(changes.length));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await drainChildQueue('acc-1');

    expect(mockRepo.recordChildQueueFailure).toHaveBeenCalledWith(['q1'], 'Expense item not found');
    const pushed = mockApi.pushChanges.mock.calls.flatMap((c) => c[0]);
    expect(pushed.map((c: { entityId: string }) => c.entityId)).toEqual(['e-2:c-2']);
    warn.mockRestore();
  });
});

describe('fix round 1 — account pinning, server presence, adoption', () => {
  const ok = (n: number) => ({
    results: Array.from({ length: n }, (_, i) => ({ entityId: `x${i}`, status: 'success', serverId: `srv-${i}` })),
    serverTimestamp: '',
    summary: { success: n, conflicts: 0, errors: 0 },
  });

  it("a drain started for account A sends A's id even if the current account changes mid-drain", async () => {
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'child', 'c-1', 'create', { name: 'Ala', clientId: 'c-1', archivedAt: null }),
      q('q2', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
      q('q3', 'expense_item_child', 'i-1', 'update', { expenseId: 'e-2', itemId: 'i-1', childId: 'c-1' }),
    ]);
    mockApi.getAccountEncryptionStatus.mockImplementation(async () => {
      mockCurrentAccount = 'acc-2'; // the user switches while the drain awaits
      return { encryptionTier: 0 };
    });
    mockApi.pushChanges.mockImplementation(async (changes: unknown[]) => ok(changes.length));
    mockApi.setItemChild.mockResolvedValue(undefined);

    await drainChildQueue('acc-1');

    expect(mockApi.pushChanges).toHaveBeenCalledTimes(2);
    for (const call of mockApi.pushChanges.mock.calls) {
      expect(call[1]).toEqual({ accountId: 'acc-1' });
      for (const change of call[0]) expect(change.accountId).toBe('acc-1');
    }
    expect(mockApi.setItemChild).toHaveBeenCalledWith('e-2', 'i-1', 'c-1', { accountId: 'acc-1' });
  });

  it('changes for an expense not yet on the server wait without counting an attempt', async () => {
    mockRepo.getUnsyncedExpenseIds.mockResolvedValue(new Set(['e-1']));
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
      q('q2', 'expense_item_child', 'i-1', 'update', { expenseId: 'e-1', itemId: 'i-1', childId: null }),
      q('q3', 'expense_child', 'e-2:c-1', 'create', { expenseId: 'e-2', childId: 'c-1', share: 1 }),
    ]);
    mockApi.pushChanges.mockImplementation(async (changes: unknown[]) => ok(changes.length));

    await drainChildQueue('acc-1');

    const pushed = mockApi.pushChanges.mock.calls.flatMap((c) => c[0]);
    expect(pushed.map((c: { entityId: string }) => c.entityId)).toEqual(['e-2:c-1']);
    expect(mockApi.setItemChild).not.toHaveBeenCalled();
    expect(mockRepo.recordChildQueueFailure).not.toHaveBeenCalled();
    expect(mockRepo.deleteQueuedChildChanges).toHaveBeenCalledWith(['q3']);
    expect(mockRepo.deleteQueuedChildChanges).not.toHaveBeenCalledWith(['q1']);
  });

  it('a line still under its client id (expense on the server) waits without counting an attempt', async () => {
    mockRepo.getUnsyncedItemIds.mockResolvedValue(new Set(['local-i-1']));
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'expense_item_child', 'local-i-1', 'update', { expenseId: 'e-1', itemId: 'local-i-1', childId: 'c-1' }),
    ]);

    await drainChildQueue('acc-1');

    expect(mockRepo.getUnsyncedItemIds).toHaveBeenCalledWith(['local-i-1']);
    expect(mockApi.setItemChild).not.toHaveBeenCalled();
    expect(mockRepo.recordChildQueueFailure).not.toHaveBeenCalled();
  });

  it('the pull merge never touches an expense with queued link/line changes', async () => {
    mockRepo.getPendingAttributionExpenseIds.mockResolvedValue(new Set(['e-1']));
    mockRepo.getExpenseChildLinks.mockResolvedValue([{ expenseId: 'e-1', childId: 'c-1', share: 1 }]);
    mockItemRepo.getAttributedItems.mockResolvedValue([{ id: 'i-1', expenseId: 'e-1', childId: 'c-2' }]);

    await mergeServerChildAttribution(
      'acc-1',
      [{ expenseId: 'e-1', links: [], items: [{ id: 'i-1', childId: null }] }],
      new Map(),
    );

    expect(mockRepo.replaceExpenseChildLinks).not.toHaveBeenCalled();
    expect(mockItemRepo.setExpenseItemChild).not.toHaveBeenCalled();
  });

  it('the pull merge does replace links of an expense with nothing queued', async () => {
    mockRepo.getExpenseChildLinks.mockResolvedValue([{ expenseId: 'e-1', childId: 'c-1', share: 1 }]);
    await mergeServerChildAttribution('acc-1', [{ expenseId: 'e-1', links: [], items: [] }], new Map());
    expect(mockRepo.replaceExpenseChildLinks).toHaveBeenCalledWith('e-1', []);
  });

  it('two-device adoption: the pull keeps one local row and links push with the server PK', async () => {
    // This device created "Ala" as L1; the server adopted the row another device created (clientId L0).
    mockRepo.getChildRecords.mockResolvedValue([
      { id: 'L1', serverId: 'srv-1', accountId: 'acc-1', name: 'Ala', archivedAt: null, isDeleted: false, syncStatus: 'synced', updatedAt: 1 },
    ]);
    mockApi.getChildren.mockResolvedValue([
      { id: 'srv-1', clientId: 'L0', accountId: 'acc-1', name: 'Ala', archivedAt: null },
    ]);
    mockRepo.getChildren.mockResolvedValue([
      { id: 'L1', clientId: 'L1', accountId: 'acc-1', name: 'Ala', archivedAt: null },
    ]);
    mockRepo.getQueuedChildChanges.mockResolvedValue([]);

    await useChildStore.getState().syncFromServer();

    expect(mockRepo.upsertChild).toHaveBeenCalledTimes(1);
    expect(mockRepo.upsertChild).toHaveBeenCalledWith(expect.objectContaining({ id: 'L1', serverId: 'srv-1' }));
    expect(mockRepo.softDeleteChildLocally).not.toHaveBeenCalled();
    const map = await useChildStore.getState().resolveServerChildIds(['srv-1']);
    expect(map.get('srv-1')).toBe('L1');

    // The queued changes referencing L1 are sent with the server PK, which the server resolves.
    mockRepo.getChildServerIds.mockResolvedValue(new Map([['L1', 'srv-1']]));
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'child', 'L1', 'update', { name: 'Ala', archivedAt: '2026-01-01T00:00:00.000Z' }),
      q('q2', 'expense_child', 'e-1:L1', 'create', { expenseId: 'e-1', childId: 'L1', share: 1 }),
      q('q3', 'expense_item_child', 'i-9', 'update', { expenseId: 'e-2', itemId: 'i-9', childId: 'L1' }),
    ]);
    mockApi.getAccountEncryptionStatus.mockResolvedValue({ encryptionTier: 0 });
    mockApi.pushChanges.mockImplementation(async (changes: unknown[]) => ok(changes.length));
    mockApi.setItemChild.mockResolvedValue(undefined);

    await drainChildQueue('acc-1');

    const [childPush, linkPush] = mockApi.pushChanges.mock.calls.map((c) => c[0]);
    expect(childPush[0].entityId).toBe('srv-1');
    expect(childPush[0].payload.clientId).toBe('L1');
    expect(mockRepo.markChildSynced).toHaveBeenCalledWith('L1', 'srv-0');
    expect(linkPush[0].payload).toEqual({ expenseId: 'e-1', childId: 'srv-1', share: 1 });
    expect(mockApi.setItemChild).toHaveBeenCalledWith('e-2', 'i-9', 'srv-1', { accountId: 'acc-1' });
  });

  it('an empty encryption-status body is not tier 0: nothing is pushed', async () => {
    mockApi.getAccountEncryptionStatus.mockResolvedValue(undefined);
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'child', 'c-1', 'create', { name: 'Ala', clientId: 'c-1', archivedAt: null }),
    ]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await drainChildQueue('acc-1');
    expect(mockApi.pushChanges).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('fix round 2 — an edited server-known line does not block', () => {
  it('pushes the line change and the later link for the same expense', async () => {
    // getUnsyncedItemIds answers by identity: the edited line is known to the server.
    mockRepo.getUnsyncedItemIds.mockResolvedValue(new Set());
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      q('q1', 'expense_item_child', 'srv-i-1', 'update', { expenseId: 'e-1', itemId: 'srv-i-1', childId: null }),
      q('q2', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
    ]);
    mockApi.setItemChild.mockResolvedValue(undefined);
    mockApi.pushChanges.mockImplementation(async (changes: unknown[]) => ({
      results: changes.map(() => ({ entityId: 'x', status: 'success' })),
      serverTimestamp: '',
      summary: { success: changes.length, conflicts: 0, errors: 0 },
    }));

    await drainChildQueue('acc-1');

    expect(mockApi.setItemChild).toHaveBeenCalledWith('e-1', 'srv-i-1', null, { accountId: 'acc-1' });
    expect(mockApi.pushChanges).toHaveBeenCalledTimes(1);
    expect(mockRepo.deleteQueuedChildChanges).toHaveBeenCalledWith(['q1']);
    expect(mockRepo.deleteQueuedChildChanges).toHaveBeenCalledWith(['q2']);
  });
});

describe('final fix — undeliverable line changes (R12)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const lineQ = (id: string, expenseId: string, itemId: string, since?: number | null) => ({
    ...q(id, 'expense_item_child', itemId, 'update', { expenseId, itemId, childId: 'c-1' }),
    undeliverableSince: since ?? null,
  });

  it('parent on the server, line unknown: stamped undeliverable, no attempt, does not hold back the expense', async () => {
    mockRepo.getUnsyncedItemIds.mockResolvedValue(new Set(['local-i-1']));
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      lineQ('q1', 'e-1', 'local-i-1'),
      q('q2', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
    ]);
    mockApi.pushChanges.mockImplementation(async (changes: unknown[]) => ({
      results: changes.map(() => ({ entityId: 'x', status: 'success' })),
      serverTimestamp: '',
      summary: { success: changes.length, conflicts: 0, errors: 0 },
    }));

    await drainChildQueue('acc-1');

    expect(mockApi.setItemChild).not.toHaveBeenCalled();
    expect(mockRepo.recordChildQueueFailure).not.toHaveBeenCalled();
    expect(mockRepo.markLinesUndeliverable).toHaveBeenCalledWith(['q1'], expect.any(Number));
    expect(mockRepo.deleteQueuedChildChanges).toHaveBeenCalledWith(['q2']);
    expect(mockRepo.deleteQueuedChildChanges).not.toHaveBeenCalledWith(['q1']);
  });

  it(`drops a line change undeliverable for ${UNDELIVERABLE_LINE_TTL_MS / DAY} days and warns with a count`, async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRepo.getUnsyncedItemIds.mockResolvedValue(new Set(['local-i-1', 'local-i-2']));
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      lineQ('q1', 'e-1', 'local-i-1', Date.now() - UNDELIVERABLE_LINE_TTL_MS - 1000),
      lineQ('q2', 'e-1', 'local-i-2', Date.now() - DAY),
    ]);

    await drainChildQueue('acc-1');

    expect(mockRepo.deleteQueuedChildChanges).toHaveBeenCalledWith(['q1']);
    expect(mockRepo.markLinesUndeliverable).toHaveBeenCalledWith(['q2'], expect.any(Number));
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('1 line'))).toBe(true);
    warn.mockRestore();
  });

  it('while the parent expense is not on the server the line waits, unstamped and never dropped', async () => {
    mockRepo.getUnsyncedExpenseIds.mockResolvedValue(new Set(['e-1']));
    mockRepo.getUnsyncedItemIds.mockResolvedValue(new Set(['local-i-1']));
    mockRepo.getQueuedChildChanges.mockResolvedValue([lineQ('q1', 'e-1', 'local-i-1', Date.now() - 30 * DAY)]);

    await drainChildQueue('acc-1');

    expect(mockRepo.markLinesUndeliverable).not.toHaveBeenCalled();
    expect(mockRepo.deleteQueuedChildChanges).not.toHaveBeenCalled();
  });

  it('countStatementQueue: undeliverable lines are reported, not counted as pending', async () => {
    mockRepo.getUnsyncedExpenseIds.mockResolvedValue(new Set(['e-2']));
    mockRepo.getUnsyncedItemIds.mockResolvedValue(new Set(['local-i-1', 'local-i-3']));
    mockRepo.getQueuedChildChanges.mockResolvedValue([
      lineQ('q1', 'e-1', 'local-i-1'), // undeliverable
      lineQ('q1b', 'e-1', 'local-i-1'), // same line, coalesced
      lineQ('q2', 'e-1', 'srv-i-2'), // deliverable, pending
      lineQ('q3', 'e-2', 'local-i-3'), // parent not on the server: pending
      q('q4', 'expense_child', 'e-1:c-1', 'create', { expenseId: 'e-1', childId: 'c-1', share: 1 }),
      { ...q('q5', 'expense_child', 'e-3:c-1', 'create', { expenseId: 'e-3', childId: 'c-1', share: 1 }), attempts: 10 },
    ]);

    await expect(countStatementQueue('acc-1')).resolves.toEqual({ pending: 3, undeliverableLines: 1 });
  });
});
