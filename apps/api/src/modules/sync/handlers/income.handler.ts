import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processIncomeChange(
  ctx: SyncHandlerContext,
  accountId: string,
  userId: string,
  change: Extract<SyncChange, { entityType: 'income' }>,
): Promise<SyncResult> {
  const { operation, payload, encryptedPayload, encryptionKeyVersion, clientVersion, entityId } = change;

  const existing = await ctx.incomesService.getByClientId(accountId, entityId);

  if (operation === 'create') {
    if (existing) {
      if (existing.syncVersion !== clientVersion) {
        return { entityId, status: 'conflict', serverVersion: existing.syncVersion, serverData: existing };
      }
      return { entityId, status: 'success', serverId: existing.id, serverVersion: existing.syncVersion };
    }

    const created = await ctx.incomesService.create(accountId, userId, {
      ...payload,
      localId: entityId,
      encryptedPayload,
      encryptionKeyVersion,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (!created) {
      return { entityId, status: 'error', error: 'Failed to create income' };
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
    const updated = await ctx.incomesService.update(accountId, existing.id, {
      ...payload,
      encryptedPayload,
      encryptionKeyVersion,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { entityId, status: 'success', serverVersion: updated?.syncVersion ?? existing.syncVersion + 1 };
  }

  if (operation === 'delete') {
    await ctx.incomesService.remove(accountId, existing.id);
    return { entityId, status: 'success' };
  }

  return { entityId, status: 'error', error: 'Invalid operation' };
}
