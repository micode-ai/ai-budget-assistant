jest.mock('@/services/api', () => ({
  api: {
    createSplit: jest.fn(),
    getSplit: jest.fn(),
    confirmSplitParticipant: jest.fn(),
    cancelSplit: jest.fn(),
    getRecentSplitParticipants: jest.fn(),
    resolveSplitFlag: jest.fn(),
    reassignSplitItem: jest.fn(),
  },
}));

jest.mock('../receiptSplitParticipantIndex', () => ({
  recordParticipants: jest.fn(),
}));

import { useReceiptSplitStore } from '@/stores/receiptSplitStore';
import { api } from '@/services/api';
import { recordParticipants } from '../receiptSplitParticipantIndex';
import type { SplitStateResponse } from '@budget/shared-types';

const createSplit = jest.mocked(api.createSplit);
const getSplit = jest.mocked(api.getSplit);
const confirmSplitParticipant = jest.mocked(api.confirmSplitParticipant);
const cancelSplit = jest.mocked(api.cancelSplit);
const getRecentSplitParticipants = jest.mocked(api.getRecentSplitParticipants);
const resolveSplitFlag = jest.mocked(api.resolveSplitFlag);
const reassignSplitItem = jest.mocked(api.reassignSplitItem);
const recordParticipantsMock = recordParticipants as jest.Mock;

function makeSplit(overrides: Partial<SplitStateResponse> = {}): SplitStateResponse {
  return {
    expenseId: 'expense-1',
    ownShare: 12.5,
    currencyCode: 'USD',
    participants: [
      { id: 'p1', name: 'Alice', amount: 10, currencyCode: 'USD', status: 'sent', url: 'https://x/s/tok1', flags: [], itemIds: [], itemShareBp: {} },
      { id: 'p2', name: 'Bob', amount: 10, currencyCode: 'USD', status: 'sent', url: 'https://x/s/tok2', flags: [], itemIds: [], itemShareBp: {} },
    ],
    groupUrl: 'https://x/s/g/grouptok1',
    ...overrides,
  };
}

// 404 is thrown by http-client.ts as `new Error(message)` with a `.status`
// property attached (see request()'s `!response.ok` branch) — not a typed
// HttpError class. Mirror that shape here rather than inventing one.
function httpError(status: number, message = 'Request failed'): Error {
  return Object.assign(new Error(message), { status });
}

describe('receiptSplitStore', () => {
  beforeEach(() => {
    useReceiptSplitStore.setState({
      expenseId: null,
      split: null,
      isLoading: false,
      recentParticipantNames: [],
    });
    jest.clearAllMocks();
  });

  describe('load', () => {
    it('populates split from the API', async () => {
      const split = makeSplit();
      getSplit.mockResolvedValue(split);

      await useReceiptSplitStore.getState().load('expense-1');

      expect(getSplit).toHaveBeenCalledWith('expense-1');
      expect(useReceiptSplitStore.getState().split).toEqual(split);
      expect(useReceiptSplitStore.getState().isLoading).toBe(false);
      // Re-affirms the participantId -> expenseId index (see
      // receiptSplitParticipantIndex.ts) so a later `split_payment_claimed`
      // push can resolve its deep-link target.
      expect(recordParticipantsMock).toHaveBeenCalledWith('expense-1', ['p1', 'p2']);
    });

    it('on a 404 (no split exists yet) sets split to null without warning', async () => {
      useReceiptSplitStore.setState({ expenseId: 'expense-1', split: makeSplit() });
      getSplit.mockRejectedValue(httpError(404, 'No split exists for this expense'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await useReceiptSplitStore.getState().load('expense-1');

      expect(useReceiptSplitStore.getState().split).toBeNull();
      expect(useReceiptSplitStore.getState().isLoading).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('on a real failure keeps the previous split and warns', async () => {
      const previous = makeSplit();
      useReceiptSplitStore.setState({ expenseId: 'expense-1', split: previous });
      getSplit.mockRejectedValue(httpError(500, 'Internal Server Error'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await useReceiptSplitStore.getState().load('expense-1');

      expect(useReceiptSplitStore.getState().split).toEqual(previous);
      expect(useReceiptSplitStore.getState().isLoading).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });

    it('clears a stale split from a different expense immediately, before the new one resolves', async () => {
      // Guards the store against showing expense A's split while expense B's
      // receipt-split screen is loading (the FamilyFeedWidget stale-cross-id
      // bug class named in the task brief).
      const splitForA = makeSplit({ expenseId: 'expense-A' });
      useReceiptSplitStore.setState({ expenseId: 'expense-A', split: splitForA });

      let resolveFetch: (value: SplitStateResponse) => void = () => {};
      getSplit.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      );

      const pending = useReceiptSplitStore.getState().load('expense-B');

      // Synchronously after calling load(), before the API promise resolves,
      // expense A's split must already be gone.
      expect(useReceiptSplitStore.getState().split).toBeNull();

      const splitForB = makeSplit({ expenseId: 'expense-B' });
      resolveFetch(splitForB);
      await pending;

      expect(useReceiptSplitStore.getState().split).toEqual(splitForB);
    });
  });

  describe('create', () => {
    it('stores the split returned by the API', async () => {
      const split = makeSplit();
      createSplit.mockResolvedValue(split);

      await useReceiptSplitStore
        .getState()
        .create('expense-1', { participants: [{ name: 'Alice' }], mode: 'equal' });

      expect(createSplit).toHaveBeenCalledWith('expense-1', {
        participants: [{ name: 'Alice' }],
        mode: 'equal',
      });
      expect(useReceiptSplitStore.getState().split).toEqual(split);
      // The payer's device is the only place these participant ids are ever
      // minted from — recording them here is what lets the
      // `split_payment_claimed` push (participantId only, no expenseId)
      // resolve its deep-link target.
      expect(recordParticipantsMock).toHaveBeenCalledWith('expense-1', ['p1', 'p2']);
    });
  });

  describe('confirm', () => {
    it('optimistically marks the participant settled, then applies the server response', async () => {
      const split = makeSplit();
      useReceiptSplitStore.setState({ expenseId: 'expense-1', split });

      let resolveConfirm: (value: (typeof split.participants)[number]) => void = () => {};
      confirmSplitParticipant.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveConfirm = resolve;
          }),
      );

      const pending = useReceiptSplitStore.getState().confirm('expense-1', 'p1');

      // Optimistic: settled before the server call resolves.
      const optimisticParticipant = useReceiptSplitStore
        .getState()
        .split?.participants.find((p) => p.id === 'p1');
      expect(optimisticParticipant?.status).toBe('settled');
      // The other participant is untouched.
      expect(
        useReceiptSplitStore.getState().split?.participants.find((p) => p.id === 'p2')?.status,
      ).toBe('sent');

      resolveConfirm({ ...split.participants[0], status: 'settled' });
      await pending;

      expect(
        useReceiptSplitStore.getState().split?.participants.find((p) => p.id === 'p1')?.status,
      ).toBe('settled');
      expect(confirmSplitParticipant).toHaveBeenCalledWith('expense-1', 'p1');
    });

    it('rolls back the optimistic update on failure', async () => {
      const split = makeSplit();
      useReceiptSplitStore.setState({ expenseId: 'expense-1', split });
      confirmSplitParticipant.mockRejectedValue(new Error('network'));

      await expect(useReceiptSplitStore.getState().confirm('expense-1', 'p1')).rejects.toThrow(
        'network',
      );

      expect(useReceiptSplitStore.getState().split).toEqual(split);
    });
  });

  describe('cancel', () => {
    it('clears the split on success', async () => {
      useReceiptSplitStore.setState({ expenseId: 'expense-1', split: makeSplit() });
      cancelSplit.mockResolvedValue({ success: true });

      await useReceiptSplitStore.getState().cancel('expense-1');

      expect(cancelSplit).toHaveBeenCalledWith('expense-1');
      expect(useReceiptSplitStore.getState().split).toBeNull();
    });
  });

  describe('resolveFlag (ABA guest-split-item-dispute)', () => {
    function splitWithFlag(): SplitStateResponse {
      const split = makeSplit();
      return {
        ...split,
        participants: split.participants.map((p) =>
          p.id === 'p1'
            ? { ...p, flags: [{ id: 'flag-1', itemId: 'item-1', note: 'not mine', createdAt: '2026-01-01T00:00:00.000Z' }] }
            : p,
        ),
      };
    }

    it('optimistically removes the flag, then confirms via the API', async () => {
      const split = splitWithFlag();
      useReceiptSplitStore.setState({ expenseId: 'expense-1', split });
      resolveSplitFlag.mockResolvedValue({ success: true });

      await useReceiptSplitStore.getState().resolveFlag('expense-1', 'flag-1');

      expect(resolveSplitFlag).toHaveBeenCalledWith('expense-1', 'flag-1');
      expect(
        useReceiptSplitStore.getState().split?.participants.find((p) => p.id === 'p1')?.flags,
      ).toEqual([]);
      // The other participant's (empty) flag list is untouched.
      expect(
        useReceiptSplitStore.getState().split?.participants.find((p) => p.id === 'p2')?.flags,
      ).toEqual([]);
    });

    it('rolls back the optimistic removal on failure', async () => {
      const split = splitWithFlag();
      useReceiptSplitStore.setState({ expenseId: 'expense-1', split });
      resolveSplitFlag.mockRejectedValue(new Error('network'));

      await expect(
        useReceiptSplitStore.getState().resolveFlag('expense-1', 'flag-1'),
      ).rejects.toThrow('network');

      expect(useReceiptSplitStore.getState().split).toEqual(split);
    });

    it('no-ops when there is no split loaded', async () => {
      useReceiptSplitStore.setState({ expenseId: null, split: null });
      await useReceiptSplitStore.getState().resolveFlag('expense-1', 'flag-1');
      expect(resolveSplitFlag).not.toHaveBeenCalled();
    });
  });

  describe('reassignItem (ABA-546, in-place line reassignment)', () => {
    it('is non-optimistic: replaces the whole split with the server response only after it resolves', async () => {
      const before = makeSplit();
      useReceiptSplitStore.setState({ expenseId: 'expense-1', split: before });

      let resolveReassign: (value: SplitStateResponse) => void = () => {};
      reassignSplitItem.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveReassign = resolve;
          }),
      );

      const pending = useReceiptSplitStore.getState().reassignItem('expense-1', 'item-1', ['p2']);

      // Nothing changes before the server responds — a reassignment
      // recomputes every participant's amount, not just the touched one, so
      // there is no safe partial optimistic update to apply here.
      expect(useReceiptSplitStore.getState().split).toEqual(before);

      const after = makeSplit({
        participants: [
          { ...before.participants[0], amount: 0, itemIds: [] },
          { ...before.participants[1], amount: 20, itemIds: ['item-1'] },
        ],
      });
      resolveReassign(after);
      await pending;

      expect(reassignSplitItem).toHaveBeenCalledWith('expense-1', 'item-1', ['p2']);
      expect(useReceiptSplitStore.getState().split).toEqual(after);
    });

    it('rethrows on failure, leaving the previous split untouched', async () => {
      const split = makeSplit();
      useReceiptSplitStore.setState({ expenseId: 'expense-1', split });
      reassignSplitItem.mockRejectedValue(new Error('Cannot change this split — someone has already confirmed a payment'));

      await expect(
        useReceiptSplitStore.getState().reassignItem('expense-1', 'item-1', ['p2']),
      ).rejects.toThrow('already confirmed a payment');

      expect(useReceiptSplitStore.getState().split).toEqual(split);
    });
  });

  describe('loadRecentParticipantNames', () => {
    it('populates recentParticipantNames from the API', async () => {
      getRecentSplitParticipants.mockResolvedValue({ names: ['Alice', 'Bob'] });

      await useReceiptSplitStore.getState().loadRecentParticipantNames();

      expect(useReceiptSplitStore.getState().recentParticipantNames).toEqual(['Alice', 'Bob']);
    });

    it('warns (never throws or crashes) on failure and leaves the previous list untouched', async () => {
      useReceiptSplitStore.setState({ recentParticipantNames: ['Alice'] });
      getRecentSplitParticipants.mockRejectedValue(new Error('network'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await useReceiptSplitStore.getState().loadRecentParticipantNames();

      expect(useReceiptSplitStore.getState().recentParticipantNames).toEqual(['Alice']);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });
  });
});
