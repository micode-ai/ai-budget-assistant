import { executeSql, withTransaction } from './client';
import type { TripExpenseShare } from '@budget/shared-types';

interface TripExpenseShareRow {
  id: string;
  expense_id: string;
  user_id: string;
  share_type: string;
  share_amount: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_version: number;
}

function rowToShare(row: TripExpenseShareRow): TripExpenseShare {
  return {
    id: row.id,
    expenseId: row.expense_id,
    userId: row.user_id,
    shareType: row.share_type as TripExpenseShare['shareType'],
    shareAmount: row.share_amount,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function shareToParams(share: TripExpenseShare, now: number): (string | number)[] {
  return [
    share.id,
    share.expenseId,
    share.userId,
    share.shareType,
    share.shareAmount,
    new Date(share.createdAt).getTime(),
    now,
    0,
    0,
  ];
}

export async function insertShare(share: TripExpenseShare): Promise<void> {
  const now = Date.now();
  await executeSql(
    `INSERT INTO trip_expense_shares (
      id, expense_id, user_id, share_type, share_amount,
      created_at, updated_at, is_deleted, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    shareToParams(share, now),
  );
}

export async function bulkInsertShares(shares: TripExpenseShare[]): Promise<void> {
  await withTransaction(async () => {
    for (const share of shares) {
      await insertShare(share);
    }
  });
}

export async function getSharesForExpense(expenseId: string): Promise<TripExpenseShare[]> {
  const rows = await executeSql<TripExpenseShareRow>(
    'SELECT * FROM trip_expense_shares WHERE expense_id = ? AND is_deleted = 0',
    [expenseId],
  );
  return rows.map(rowToShare);
}

export async function deleteAllSharesForExpense(expenseId: string): Promise<void> {
  await executeSql(
    'UPDATE trip_expense_shares SET is_deleted = 1, updated_at = ? WHERE expense_id = ?',
    [Date.now(), expenseId],
  );
}
