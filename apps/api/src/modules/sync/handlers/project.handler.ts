import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processProjectChange(
  ctx: SyncHandlerContext,
  accountId: string,
  _userId: string,
  change: Extract<SyncChange, { entityType: 'project' }>,
): Promise<SyncResult> {
  const { payload } = change;
  const encData = { encryptedPayload: change.encryptedPayload, encryptionKeyVersion: change.encryptionKeyVersion };

  if (change.operation === 'create') {
    const project = await ctx.prisma.project.upsert({
      where: { accountId_clientId: { accountId, clientId: payload.localId || change.entityId } },
      create: {
        accountId,
        clientId: payload.localId || change.entityId,
        name: payload.name,
        description: payload.description,
        color: payload.color,
        icon: payload.icon,
        startDate: payload.startDate ? new Date(payload.startDate) : undefined,
        endDate: payload.endDate ? new Date(payload.endDate) : undefined,
        budget: payload.budget,
        currencyCode: payload.currencyCode,
        ...encData,
      },
      update: {
        name: payload.name,
        description: payload.description,
        color: payload.color,
        icon: payload.icon,
        startDate: payload.startDate ? new Date(payload.startDate) : undefined,
        endDate: payload.endDate ? new Date(payload.endDate) : undefined,
        budget: payload.budget,
        currencyCode: payload.currencyCode,
        ...encData,
        isDeleted: false,
      },
    });
    return { entityId: change.entityId, status: 'success', serverId: project.id, serverVersion: project.syncVersion };
  }
  if (change.operation === 'update') {
    const project = await ctx.prisma.project.findFirst({ where: { id: change.entityId, accountId } });
    if (!project) return { entityId: change.entityId, status: 'error', error: 'Project not found' };
    const updated = await ctx.prisma.project.update({
      where: { id: change.entityId },
      data: {
        name: payload.name,
        description: payload.description,
        color: payload.color,
        icon: payload.icon,
        startDate: payload.startDate ? new Date(payload.startDate) : undefined,
        endDate: payload.endDate ? new Date(payload.endDate) : undefined,
        budget: payload.budget,
        currencyCode: payload.currencyCode,
        ...encData,
        syncVersion: { increment: 1 },
      },
    });
    return { entityId: change.entityId, status: 'success', serverVersion: updated.syncVersion };
  }
  if (change.operation === 'delete') {
    await ctx.prisma.project.updateMany({
      where: { id: change.entityId, accountId },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    return { entityId: change.entityId, status: 'success' };
  }
  return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
}
