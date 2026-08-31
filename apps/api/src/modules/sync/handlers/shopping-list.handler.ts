import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processShoppingListChange(
  ctx: SyncHandlerContext,
  accountId: string,
  userId: string,
  change: Extract<SyncChange, { entityType: 'shopping_list' }>,
): Promise<SyncResult> {
  const { payload } = change;
  const cid = payload.localId || change.entityId;
  if (change.operation === 'create') {
    const list = await ctx.prisma.shoppingList.upsert({
      where: { accountId_clientId: { accountId, clientId: cid } },
      create: {
        accountId, clientId: cid, name: payload.name,
        isDefault: payload.isDefault ?? false, isArchived: payload.isArchived ?? false,
        sortOrder: payload.sortOrder ?? 0, createdByUserId: userId,
      },
      update: {
        name: payload.name, isArchived: payload.isArchived ?? false,
        sortOrder: payload.sortOrder ?? 0, isDeleted: false,
      },
    });
    return { entityId: change.entityId, status: 'success', serverId: list.id, serverVersion: list.syncVersion };
  }
  if (change.operation === 'update') {
    const list = await ctx.prisma.shoppingList.findFirst({ where: { accountId, OR: [{ id: change.entityId }, { clientId: cid }] } });
    if (!list) return { entityId: change.entityId, status: 'error', error: 'List not found' };
    const updated = await ctx.prisma.shoppingList.update({
      where: { id: list.id },
      data: { name: payload.name, isArchived: payload.isArchived ?? false, sortOrder: payload.sortOrder ?? 0, syncVersion: { increment: 1 } },
    });
    return { entityId: change.entityId, status: 'success', serverVersion: updated.syncVersion };
  }
  if (change.operation === 'delete') {
    await ctx.prisma.shoppingList.updateMany({ where: { accountId, OR: [{ id: change.entityId }, { clientId: cid }] }, data: { isDeleted: true, syncVersion: { increment: 1 } } });
    return { entityId: change.entityId, status: 'success' };
  }
  return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
}
