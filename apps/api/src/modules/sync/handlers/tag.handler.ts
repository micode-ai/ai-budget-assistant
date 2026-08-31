import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processTagChange(
  ctx: SyncHandlerContext,
  accountId: string,
  _userId: string,
  change: Extract<SyncChange, { entityType: 'tag' }>,
): Promise<SyncResult> {
  const { payload } = change;
  const encData = { encryptedPayload: change.encryptedPayload, encryptionKeyVersion: change.encryptionKeyVersion };

  if (change.operation === 'create') {
    const tag = await ctx.prisma.tag.upsert({
      where: { accountId_name: { accountId, name: payload.name } },
      create: { accountId, name: payload.name, color: payload.color, icon: payload.icon, clientId: payload.clientId, ...encData },
      update: { name: payload.name, color: payload.color, icon: payload.icon, ...encData, isDeleted: false },
    });
    return { entityId: change.entityId, status: 'success', serverId: tag.id, serverVersion: tag.syncVersion };
  }
  if (change.operation === 'update') {
    const tag = await ctx.prisma.tag.findFirst({ where: { id: change.entityId, accountId } });
    if (!tag) return { entityId: change.entityId, status: 'error', error: 'Tag not found' };
    const updated = await ctx.prisma.tag.update({
      where: { id: change.entityId },
      data: { name: payload.name, color: payload.color, icon: payload.icon, ...encData, syncVersion: { increment: 1 } },
    });
    return { entityId: change.entityId, status: 'success', serverVersion: updated.syncVersion };
  }
  if (change.operation === 'delete') {
    await ctx.prisma.tag.updateMany({
      where: { id: change.entityId, accountId },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    return { entityId: change.entityId, status: 'success' };
  }
  return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
}
