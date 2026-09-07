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
  getMessages: jest.fn().mockResolvedValue([]),
  upsertMessage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/api', () => ({ api: {} }));

import { useChatStore } from '../chatStore';

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
