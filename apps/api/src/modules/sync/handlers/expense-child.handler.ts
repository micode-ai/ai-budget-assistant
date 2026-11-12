import type { SyncChange } from '@budget/shared-types';
import { touchExpenses } from '../../expenses/expense-touch.util';
import { SyncHandlerContext, SyncResult } from '../sync-types';

type ExpenseChildChange = Extract<SyncChange, { entityType: 'expense_child' }>;

/**
 * Sync handler for whole-expense child attribution (`ExpenseChild`). Mirrors
 * the `expense_tag` branch of `SyncService.processRelationChange`, with one
 * difference: the link is keyed by the `(expenseId, childId)` pair, and both
 * ids may be the device's local ids — each is resolved `OR:[{id},{clientId}]`
 * within the account, and only the resolved server PKs are ever written.
 *
 * Mutual exclusivity with line attribution is NOT enforced here: the device
 * queues the matching item `childId` changes itself, in order; clearing them a
 * second time on the server would only produce version conflicts on its push.
 */
export async function processExpenseChildChange(
  ctx: SyncHandlerContext,
  accountId: string,
  _userId: string,
  change: ExpenseChildChange,
): Promise<SyncResult> {
  const { payload, entityId } = change;

  const [expense, child] = await Promise.all([
    payload?.expenseId
      ? ctx.prisma.expense.findFirst({
          where: { accountId, OR: [{ id: payload.expenseId }, { clientId: payload.expenseId }] },
          select: { id: true },
        })
      : null,
    payload?.childId
      ? ctx.prisma.child.findFirst({
          where: { accountId, OR: [{ id: payload.childId }, { clientId: payload.childId }] },
          select: { id: true },
        })
      : null,
  ]);

  if (change.operation === 'delete') {
    if (expense && child) {
      await ctx.prisma.expenseChild.updateMany({
        where: { expenseId: expense.id, childId: child.id, isDeleted: false },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
      await touchExpenses(ctx.prisma, accountId, { id: expense.id });
    }
    // Either side gone (deleted expense / child) means the link is gone too.
    return { entityId, status: 'success' };
  }

  if (change.operation !== 'create' && change.operation !== 'update') {
    return { entityId, status: 'error', error: 'Unknown operation' };
  }
  if (!expense || !child) return { entityId, status: 'error', error: 'Entity not found' };

  const share = Number(payload.share);
  if (!Number.isFinite(share) || share <= 0 || share > 1) {
    return { entityId, status: 'error', error: 'Invalid share' };
  }

  const link = await ctx.prisma.expenseChild.upsert({
    where: { expenseId_childId: { expenseId: expense.id, childId: child.id } },
    create: { expenseId: expense.id, childId: child.id, share },
    update: { share, isDeleted: false, syncVersion: { increment: 1 } },
  });
  await touchExpenses(ctx.prisma, accountId, { id: expense.id });
  return { entityId, status: 'success', serverId: link.id, serverVersion: link.syncVersion };
}
