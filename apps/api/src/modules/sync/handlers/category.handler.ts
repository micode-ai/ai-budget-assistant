import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

// Categories are deliberately NOT sync-queue entities — see the same note on
// processBudgetChange (budget.handler.ts). Fail loudly rather than a silent
// no-op success (docs/tech-debt/sync-service-budget-category-noop-stubs.md).
export async function processCategoryChange(
  ctx: SyncHandlerContext,
  accountId: string,
  _userId: string,
  change: Extract<SyncChange, { entityType: 'category' }>,
): Promise<SyncResult> {
  ctx.logger.error(
    `Received unsupported 'category' sync change for account ${accountId} (entityId=${change.entityId}) — categories are not synced via the generic sync queue`,
  );
  return {
    entityId: change.entityId,
    status: 'error',
    error: 'Categories are not supported by the sync queue — use the /categories REST endpoints instead',
  };
}
