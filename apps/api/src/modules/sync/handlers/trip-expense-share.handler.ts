import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processTripExpenseShareChange(
  ctx: SyncHandlerContext,
  accountId: string,
  _userId: string,
  change: Extract<SyncChange, { entityType: 'tripExpenseShare' }>,
): Promise<SyncResult> {
  try {
    // Verify the expense belongs to this account before touching any share of it
    const expense = await ctx.prisma.expense.findFirst({
      where: { id: change.payload.expenseId, accountId },
    });
    if (!expense) {
      return { entityId: change.entityId, status: 'error', error: 'Expense not found' };
    }

    // Verify the target user is actually a member of this account
    const member = await ctx.prisma.accountMember.findFirst({
      where: { accountId, userId: change.payload.userId },
    });
    if (!member) {
      return { entityId: change.entityId, status: 'error', error: 'User is not a member of this account' };
    }

    if (change.operation === 'delete') {
      await ctx.prisma.tripExpenseShare.deleteMany({
        where: { expenseId: change.payload.expenseId, userId: change.payload.userId },
      });
      return { entityId: change.entityId, status: 'success' };
    }

    const row = await ctx.prisma.tripExpenseShare.upsert({
      where: { expenseId_userId: { expenseId: change.payload.expenseId, userId: change.payload.userId } },
      create: {
        expenseId: change.payload.expenseId,
        userId: change.payload.userId,
        shareType: change.payload.shareType,
        shareAmount: change.payload.shareAmount,
      },
      update: {
        shareType: change.payload.shareType,
        shareAmount: change.payload.shareAmount,
      },
    });
    return { entityId: change.entityId, status: 'success', serverId: row.id };
  } catch (error) {
    return { entityId: change.entityId, status: 'error', error: (error as Error).message };
  }
}
