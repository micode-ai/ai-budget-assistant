// chatStore.reset() (ABA-513): added so BOTH `logoutAction` (sign-out) and
// `accountStore`'s `clearAccountScopedCaches()` (account switch) have
// something real to call — see authStoreLogout.test.ts and
// accountSwitchReferenceData.test.ts for the two call sites' own tests. This
// file covers the store-level contract of `reset()` in isolation.
//
// Manual factory (not a bare automock): automocking still `require()`s the
// real `db/chatRepository` module, which imports `./client` -> expo-sqlite's
// native `openDatabaseSync` — same reason as every other db mock in this
// suite.
jest.mock('../../db/chatRepository', () => ({
  getConversations: jest.fn().mockResolvedValue([]),
  upsertConversation: jest.fn().mockResolvedValue(undefined),
  deleteConversation: jest.fn().mockResolvedValue(undefined),
  getMessages: jest.fn().mockResolvedValue([]),
  upsertMessage: jest.fn().mockResolvedValue(undefined),
}));

// ABA-514: renameConversation/deleteConversation/setConversationPinned call
// these three in addition to whatever the (still-empty, for this file's
// existing tests) `api: {}` covered. Each rollback test below installs its
// own `mockRejectedValue` per case.
jest.mock('../../services/api', () => ({
  api: {
    renameChatConversation: jest.fn(),
    deleteChatConversation: jest.fn(),
    setChatConversationPinned: jest.fn(),
  },
}));

import { useChatStore } from '../chatStore';
import { api } from '../../services/api';
import * as chatRepository from '../../db/chatRepository';

describe('chatStore.reset (ABA-513)', () => {
  afterEach(() => {
    useChatStore.getState().stopPolling();
    jest.useRealTimers();
  });

  it('clears every field back to its initial value', () => {
    useChatStore.setState({
      conversations: [{ id: 'c1' } as any],
      currentConversationId: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'x', createdAt: new Date() } as any],
      isLoading: true,
      isConfirming: true,
      error: 'boom',
      currentIsShared: true,
      currentIsOwner: false,
      ownedConversationIds: ['c1'],
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      isPolling: true,
    });

    useChatStore.getState().reset();

    expect(useChatStore.getState()).toMatchObject({
      conversations: [],
      currentConversationId: null,
      messages: [],
      isLoading: false,
      isConfirming: false,
      error: null,
      currentIsShared: false,
      currentIsOwner: true,
      ownedConversationIds: [],
      lastSyncedAt: null,
      isPolling: false,
    });
  });

  // Catches: a `reset()` that sets `isPolling: false` in state but leaves the
  // module-level timer HANDLE untouched. `startPolling()` no-ops whenever
  // that handle is still set (`if (isPolling || pollTimer) return;`), so the
  // flag alone would leave polling permanently stuck off for whatever
  // account or conversation comes next — the state would say "not polling"
  // while nothing could ever turn polling back on.
  it('clears the poll timer so startPolling can resume for the next conversation', () => {
    jest.useFakeTimers();
    const pollSpy = jest
      .spyOn(useChatStore.getState(), 'pollNewMessages')
      .mockResolvedValue(undefined);

    useChatStore.getState().startPolling();
    expect(useChatStore.getState().isPolling).toBe(true);

    useChatStore.getState().reset();
    expect(useChatStore.getState().isPolling).toBe(false);

    // The decisive assertion: under the bug (timer handle left set), this
    // second call's own guard would see the stale handle and return early,
    // so `isPolling` would stay false here instead of flipping back on.
    useChatStore.getState().startPolling();
    expect(useChatStore.getState().isPolling).toBe(true);

    jest.advanceTimersByTime(4000);
    expect(pollSpy).toHaveBeenCalledTimes(1);

    pollSpy.mockRestore();
  });
});

// ABA-514: the optimistic-rollback property of the three new store actions —
// singled out by both the task-3 report and the review brief as the thing
// that matters most here, and (before this) covered by nothing. Each test
// asserts BOTH halves of the rollback: the in-memory `conversations` entry
// AND the SQLite mirror via `chatRepository.upsertConversation` — following
// `invitationStore.test.ts`'s `'respond restores the invitation on failure'`
// shape (`set(previous); ...; expect(...).rejects.toThrow(...); expect(state
// to equal previous)`), the closest existing sibling for this exact
// optimistic-with-rollback pattern.
describe('chatStore optimistic rollback (ABA-514)', () => {
  const baseConversation = {
    id: 'c1',
    userId: 'u1',
    isShared: false,
    isPinned: false,
    title: 'Grocery run',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  } as any;

  beforeEach(() => {
    useChatStore.setState({ conversations: [baseConversation], currentConversationId: null });
    jest.clearAllMocks();
  });

  // Catches: a rewrite that drops the `chatRepository.upsertConversation(prev)`
  // call from the catch block (the cache would then keep serving the failed
  // rename on the next cold start), OR one that forgets to restore
  // `conversations` in memory (the row would keep showing the failed title
  // until the next full reload).
  it('renameConversation restores the previous title in memory and in SQLite on failure', async () => {
    (api.renameChatConversation as jest.Mock).mockRejectedValue(new Error('network'));

    await expect(useChatStore.getState().renameConversation('c1', 'New title')).rejects.toThrow('network');

    expect(useChatStore.getState().conversations).toEqual([baseConversation]);
    expect(chatRepository.upsertConversation).toHaveBeenLastCalledWith(baseConversation);
  });

  // Catches: a rewrite that drops the `chatRepository.upsertConversation(removed)`
  // restore call (the row would stay deleted from the cache even though the
  // server never actually deleted it), OR one that forgets to restore
  // `conversations` in memory. `currentConversationId` is deliberately left
  // `null` (not `'c1'`) so this test isolates the row-restore property from
  // the separate, unchanged "was the open conversation" reset behavior.
  it('deleteConversation restores the removed conversation in memory and in SQLite on failure', async () => {
    (api.deleteChatConversation as jest.Mock).mockRejectedValue(new Error('network'));

    await expect(useChatStore.getState().deleteConversation('c1')).rejects.toThrow('network');

    expect(useChatStore.getState().conversations).toEqual([baseConversation]);
    expect(chatRepository.upsertConversation).toHaveBeenLastCalledWith(baseConversation);
  });

  // Catches: a rewrite that drops the `chatRepository.upsertConversation(prev)`
  // restore call, OR one that forgets to restore `conversations` in memory —
  // either would leave a conversation showing pinned (or unpinned) when the
  // server actually rejected the flip.
  it('setConversationPinned restores the previous pin state in memory and in SQLite on failure', async () => {
    (api.setChatConversationPinned as jest.Mock).mockRejectedValue(new Error('network'));

    await expect(useChatStore.getState().setConversationPinned('c1', true)).rejects.toThrow('network');

    expect(useChatStore.getState().conversations).toEqual([baseConversation]);
    expect(chatRepository.upsertConversation).toHaveBeenLastCalledWith(baseConversation);
  });
});
