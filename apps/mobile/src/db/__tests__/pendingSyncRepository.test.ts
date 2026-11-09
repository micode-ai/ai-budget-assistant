const mockExecuteSql = jest.fn();
jest.mock('../client', () => ({ executeSql: (...args: unknown[]) => mockExecuteSql(...args) }));

import { loadPendingRows, PENDING_SYNC_TABLES } from '../pendingSyncRepository';

describe('loadPendingRows', () => {
  beforeEach(() => mockExecuteSql.mockReset());

  it('never counts soft-deleted rows (sync never uploads or re-marks them)', async () => {
    mockExecuteSql.mockResolvedValue([]);
    await loadPendingRows();
    expect(mockExecuteSql).toHaveBeenCalledTimes(PENDING_SYNC_TABLES.length);
    for (const [sql] of mockExecuteSql.mock.calls) {
      expect(sql).toMatch(/is_deleted = 0/);
      expect(sql).toMatch(/sync_status IN \('pending', 'error'\)/);
    }
  });

  it('maps rows per table and status', async () => {
    mockExecuteSql.mockResolvedValueOnce([{ status: 'error', n: 2, oldest: 5 }]).mockResolvedValue([]);
    expect(await loadPendingRows()).toEqual([
      { entity: 'expenses', status: 'error', count: 2, oldestUpdatedAt: 5 },
    ]);
  });
});
