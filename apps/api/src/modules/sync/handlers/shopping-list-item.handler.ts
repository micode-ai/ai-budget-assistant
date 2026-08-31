import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processShoppingListItemChange(
  ctx: SyncHandlerContext,
  accountId: string,
  userId: string,
  change: Extract<SyncChange, { entityType: 'shopping_list_item' }>,
): Promise<SyncResult> {
  const { payload } = change;
  const cid = payload.localId || change.entityId;
  if (change.operation === 'create') {
    // Resolve the parent list by device clientId OR server id
    const list = await ctx.prisma.shoppingList.findFirst({
      where: { accountId, OR: [{ id: payload.shoppingListId }, { clientId: payload.shoppingListId }] },
    });
    if (!list) return { entityId: change.entityId, status: 'error', error: 'Parent list not found' };
    const item = await ctx.prisma.shoppingListItem.upsert({
      where: { accountId_clientId: { accountId, clientId: cid } },
      create: {
        accountId, shoppingListId: list.id, clientId: cid,
        canonicalName: payload.canonicalName ?? null, rawLabel: payload.rawLabel,
        quantity: payload.quantity ?? 1, note: payload.note ?? null,
        isChecked: payload.isChecked ?? false, sortOrder: payload.sortOrder ?? 0, addedByUserId: userId,
      },
      update: {
        canonicalName: payload.canonicalName ?? null, rawLabel: payload.rawLabel,
        quantity: payload.quantity ?? 1, note: payload.note ?? null,
        isChecked: payload.isChecked ?? false, sortOrder: payload.sortOrder ?? 0, isDeleted: false,
      },
    });
    return { entityId: change.entityId, status: 'success', serverId: item.id, serverVersion: item.syncVersion };
  }
  if (change.operation === 'update') {
    const item = await ctx.prisma.shoppingListItem.findFirst({ where: { accountId, OR: [{ id: change.entityId }, { clientId: cid }] } });
    if (!item) return { entityId: change.entityId, status: 'error', error: 'Item not found' };
    const updated = await ctx.prisma.shoppingListItem.update({
      where: { id: item.id },
      data: {
        canonicalName: payload.canonicalName ?? null, rawLabel: payload.rawLabel,
        quantity: payload.quantity ?? 1, note: payload.note ?? null,
        isChecked: payload.isChecked ?? false, sortOrder: payload.sortOrder ?? 0, syncVersion: { increment: 1 },
      },
    });
    return { entityId: change.entityId, status: 'success', serverVersion: updated.syncVersion };
  }
  if (change.operation === 'delete') {
    await ctx.prisma.shoppingListItem.updateMany({ where: { accountId, OR: [{ id: change.entityId }, { clientId: cid }] }, data: { isDeleted: true, syncVersion: { increment: 1 } } });
    return { entityId: change.entityId, status: 'success' };
  }
  return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
}
