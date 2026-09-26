jest.mock('@/services/shareIntake', () => ({
  getInitialShare: jest.fn(),
  subscribeToShares: jest.fn(() => () => {}),
  purgeStaleSharedFiles: jest.fn(),
  deleteSharedFile: jest.fn(),
}));
// The hook module imports these for its navigation effect; ingestInitialShare
// needs none of them. Mocked so the real stores' import-time timers (e.g.
// exchangeRateStore's deferred dynamic import) cannot outlive the test run.
jest.mock('@/stores/accountStore', () => ({ useAccountStore: jest.fn() }));
jest.mock('@/stores/firstRunStore', () => ({ useFirstRunStore: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { getInitialShare } from '@/services/shareIntake';
import { ingestInitialShare } from '@/hooks/useShareIntake';
import { useShareIntakeStore } from '@/stores/shareIntakeStore';

beforeEach(() => useShareIntakeStore.getState().reset());

describe('ingestInitialShare', () => {
  it('empty initial share does not navigate', async () => {
    (getInitialShare as jest.Mock).mockResolvedValue(null);
    await ingestInitialShare();
    expect(useShareIntakeStore.getState().pendingNavigation).toBe(false);
  });

  it('queues files from the initial share', async () => {
    (getInitialShare as jest.Mock).mockResolvedValue({
      files: [{ uri: 'file:///c/a.jpg', mimeType: 'image/jpeg', name: 'a.jpg', size: 10 }],
      droppedCount: 1,
    });
    await ingestInitialShare();
    const s = useShareIntakeStore.getState();
    expect(s.queue.total).toBe(1);
    expect(s.lastDropped).toBe(1);
    expect(s.pendingNavigation).toBe(true);
  });
});
