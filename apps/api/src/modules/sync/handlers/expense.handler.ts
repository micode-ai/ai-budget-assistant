import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processExpenseChange(
  ctx: SyncHandlerContext,
  accountId: string,
  userId: string,
  change: Extract<SyncChange, { entityType: 'expense' }>,
): Promise<SyncResult> {
  const { operation, payload, encryptedPayload, encryptionKeyVersion, clientVersion, entityId } = change;

  // Check for existing record
  const existing = await ctx.expensesService.getByClientId(accountId, entityId);

  if (operation === 'create') {
    if (existing) {
      // Already exists - check version
      if (existing.syncVersion !== clientVersion) {
        return {
          entityId,
          status: 'conflict',
          serverVersion: existing.syncVersion,
          serverData: existing,
        };
      }
      return {
        entityId,
        status: 'success',
        serverId: existing.id,
        serverVersion: existing.syncVersion,
      };
    }

    // Create new expense
    const { expense: created } = await ctx.expensesService.create(accountId, userId, {
      ...payload,
      localId: entityId,
      encryptedPayload,
      encryptionKeyVersion,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (!created) {
      return { entityId, status: 'error', error: 'Failed to create expense' };
    }

    return {
      entityId,
      status: 'success',
      serverId: created.id,
      serverVersion: created.syncVersion,
    };
  }

  if (!existing) {
    return {
      entityId,
      status: 'error',
      error: 'Entity not found',
    };
  }

  // Check for conflict
  if (existing.syncVersion !== clientVersion) {
    return {
      entityId,
      status: 'conflict',
      serverVersion: existing.syncVersion,
      serverData: existing,
    };
  }

  if (operation === 'update') {
    const updated = await ctx.expensesService.update(accountId, existing.id, {
      ...payload,
      encryptedPayload,
      encryptionKeyVersion,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (!updated) {
      return { entityId, status: 'error', error: 'Failed to update expense' };
    }
    return {
      entityId,
      status: 'success',
      serverVersion: updated.syncVersion,
    };
  }

  if (operation === 'delete') {
    await ctx.expensesService.remove(accountId, existing.id);
    return {
      entityId,
      status: 'success',
    };
  }

  return {
    entityId,
    status: 'error',
    error: 'Invalid operation',
  };
}
