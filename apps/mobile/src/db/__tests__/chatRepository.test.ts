/**
 * `getConversations` encodes the server's visibility rule
 * (`accountId = A AND (isShared OR userId = me)`) entirely in SQL, so this
 * captures the SQL + params handed to the driver. Legacy rows with a NULL
 * account_id can never satisfy `account_id = ?` and are therefore excluded;
 * the next conversation-list refresh re-fetches and re-stamps them.
 */
let capturedSql: string | undefined;
let capturedParams: unknown[] = [];

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => undefined,
    getAllSync: (sql: string, ...params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return [];
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      await task();
    },
  }),
}));

import { getConversations } from '../chatRepository';

describe('getConversations', () => {
  beforeEach(() => {
    capturedSql = undefined;
    capturedParams = [];
  });

  it('requires the account for every row, not only shared ones', async () => {
    await getConversations('user-1', 'acc-A');

    expect(capturedSql).toMatch(/account_id\s*=\s*\?\s+AND\s+\(\s*is_shared\s*=\s*1\s+OR\s+user_id\s*=\s*\?\s*\)/);
    expect(capturedParams).toEqual(['acc-A', 'user-1']);
  });

  it('returns nothing (no unscoped query) when there is no current account', async () => {
    const rows = await getConversations('user-1', undefined);

    expect(rows).toEqual([]);
    expect(capturedSql).toBeUndefined();
  });
});
