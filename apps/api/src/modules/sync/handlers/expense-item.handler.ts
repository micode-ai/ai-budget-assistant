import type { SyncChange } from '@budget/shared-types';
import { resolveExpenseCategoryId } from '../../expenses/expense-category-resolver.util';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processExpenseItemChange(
  ctx: SyncHandlerContext,
  accountId: string,
  userId: string,
  change: Extract<SyncChange, { entityType: 'expense_item' }>,
): Promise<SyncResult> {
  const { operation, payload, clientVersion, entityId } = change;

  // Verify that the parent expense belongs to this account
  if (payload.expenseId) {
    const parentExpense = await ctx.prisma.expense.findFirst({
      where: { id: payload.expenseId, accountId },
    });
    if (!parentExpense) {
      return { entityId, status: 'error', error: 'Parent expense not found' };
    }
  }

  // The client addresses a category by its own local id — resolve it the
  // same way ExpensesService.create/update do (resolveExpenseCategoryId),
  // so an item created or edited offline doesn't lose its category on sync.
  // `undefined` when the payload omits categoryId at all (leave the column
  // untouched on update); mirrors ExpensesService.update's own
  // `dto.categoryId !== undefined ? ... : undefined` pattern.
  const resolvedCategoryId = payload.categoryId !== undefined
    ? await resolveExpenseCategoryId(ctx.prisma, payload.categoryId, accountId)
    : undefined;

  const existing = await ctx.prisma.expenseItem.findUnique({
    where: { id: entityId },
  });

  if (operation === 'create') {
    if (existing) {
      if (existing.syncVersion !== clientVersion) {
        return { entityId, status: 'conflict', serverVersion: existing.syncVersion, serverData: existing };
      }
      return { entityId, status: 'success', serverId: existing.id, serverVersion: existing.syncVersion };
    }

    const created = await ctx.prisma.expenseItem.create({
      data: {
        id: entityId,
        expenseId: payload.expenseId,
        description: payload.description,
        canonicalName: payload.canonicalName ?? null,
        categoryId: resolvedCategoryId ?? null,
        quantity: payload.quantity ?? 1,
        unitPrice: payload.unitPrice ?? 0,
        totalPrice: payload.totalPrice,
        sortOrder: payload.sortOrder ?? 0,
        encryptedPayload: change.encryptedPayload,
        encryptionKeyVersion: change.encryptionKeyVersion,
      },
    });

    // Sync parity (ABA-335): item-level sync writes canonicalName in a
    // separate entity from the parent expense create, so the community-price
    // hook in ExpensesService.create ran before this data existed. Fire the
    // same contribution here for device-created receipts.
    if (created.canonicalName) {
      void ctx.communityPrices
        ?.recordContribution(accountId, userId, created.expenseId)
        .catch(logFireAndForget(ctx.logger, 'SyncService.recordContribution#create'));
    }

    return { entityId, status: 'success', serverId: created.id, serverVersion: created.syncVersion };
  }

  if (!existing) {
    return { entityId, status: 'error', error: 'Entity not found' };
  }

  if (existing.syncVersion !== clientVersion) {
    return { entityId, status: 'conflict', serverVersion: existing.syncVersion, serverData: existing };
  }

  if (operation === 'update') {
    const updated = await ctx.prisma.expenseItem.update({
      where: { id: entityId },
      data: {
        description: payload.description,
        canonicalName: payload.canonicalName ?? null,
        categoryId: resolvedCategoryId,
        quantity: payload.quantity,
        unitPrice: payload.unitPrice,
        totalPrice: payload.totalPrice,
        sortOrder: payload.sortOrder,
        encryptedPayload: change.encryptedPayload,
        encryptionKeyVersion: change.encryptionKeyVersion,
        syncVersion: { increment: 1 },
      },
    });
    if (updated.canonicalName) {
      void ctx.communityPrices
        ?.recordContribution(accountId, userId, updated.expenseId)
        .catch(logFireAndForget(ctx.logger, 'SyncService.recordContribution#update'));
    }
    return { entityId, status: 'success', serverVersion: updated.syncVersion };
  }

  if (operation === 'delete') {
    await ctx.prisma.expenseItem.update({
      where: { id: entityId },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    return { entityId, status: 'success' };
  }

  return { entityId, status: 'error', error: 'Invalid operation' };
}
