/**
 * `insertAccount`'s SQL text must carry `month_anchor_day`, and a server
 * `null` (the account uses the calendar month) must be written as SQL NULL,
 * never coerced to 0 — 0 is not a valid anchor and would misrepresent the
 * user's setting.
 *
 * Following the `walletRepository.test.ts` convention: override the
 * `expo-sqlite` stub for this file only and assert on the SQL text and
 * params actually handed to the driver. `insertAccount` goes through
 * `executeSql` (`./client`), which on native resolves via
 * `expoDb.getAllSync(sql, ...params)` (see `client.native.ts`) — not
 * `runSync`, which this repository never calls.
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

import { insertAccount } from '../accountRepository';

describe('accountRepository writes the financial month anchor', () => {
  beforeEach(() => {
    capturedSql = undefined;
    capturedParams = [];
  });

  it('includes month_anchor_day in the insert', async () => {
    await insertAccount(
      {
        id: 'a1',
        name: 'Personal',
        type: 'personal',
        currencyCode: 'USD',
        ownerId: 'u1',
        isActive: true,
        monthAnchorDay: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      'owner',
    );

    expect(capturedSql).toContain('month_anchor_day');
    expect(capturedParams).toContain(10);
  });

  it('writes null rather than 0 when the account uses the calendar month', async () => {
    await insertAccount(
      {
        id: 'a2',
        name: 'Personal',
        type: 'personal',
        currencyCode: 'USD',
        ownerId: 'u1',
        isActive: true,
        monthAnchorDay: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      'owner',
    );

    expect(capturedSql).toContain('month_anchor_day');
    expect(capturedParams).not.toContain(0);
  });
});
