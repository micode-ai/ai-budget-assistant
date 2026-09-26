jest.mock('@/services/shareIntake', () => ({
  getInitialShare: jest.fn(),
  subscribeToShares: jest.fn(() => () => {}),
  purgeStaleSharedFiles: jest.fn(),
  deleteSharedFile: jest.fn(),
}));

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
