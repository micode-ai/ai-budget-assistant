import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

// Budgets are deliberately NOT sync-queue entities — the mobile app manages
// them exclusively through their own REST CRUD endpoints (BudgetsService) and
// never pushes a 'budget' SyncChange. This handler exists only because
// SyncChange's entityType union still includes it; if a client ever does
// queue one (a future offline-edit feature, a store bug), fail loudly
// instead of silently reporting success and dropping the write — a false
// 'success' here would mark the change synced on the client while the
// server discarded it (see docs/tech-debt/sync-service-budget-category-noop-stubs.md).
export async function processBudgetChange(
  ctx: SyncHandlerContext,
  accountId: string,
  _userId: string,
  change: Extract<SyncChange, { entityType: 'budget' }>,
): Promise<SyncResult> {
  ctx.logger.error(
    `Received unsupported 'budget' sync change for account ${accountId} (entityId=${change.entityId}) — budgets are not synced via the generic sync queue`,
  );
  return {
    entityId: change.entityId,
    status: 'error',
    error: 'Budgets are not supported by the sync queue — use the /budgets REST endpoints instead',
  };
}
