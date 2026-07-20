import { CacheService } from '../../common/cache/cache.service';

/**
 * Invalidate every chat tool result cached for this account. Touched on any
 * expense mutation since `get_expenses`, `get_budget_status`, and
 * `get_category_breakdown` all read from the expense table.
 *
 * Shared by ExpensesService, ExpenseBulkService, and ExpenseCrossAccountService —
 * all three mutate the `expenses` table and must bust the same cache keys.
 */
export async function invalidateExpenseChatCache(cacheService: CacheService, accountId: string): Promise<void> {
  if (!accountId) return;
  await Promise.all([
    cacheService.delByPrefix(`chat:get_expenses:${accountId}:`),
    cacheService.delByPrefix(`chat:get_budget_status:${accountId}:`),
    cacheService.delByPrefix(`chat:get_category_breakdown:${accountId}:`),
    // The AI-chat layer caches the shield tool result in FRONT of getShield, so
    // the internal `shield:` bust (post-create block) isn't enough on the chat
    // surface — bust the chat-layer shield cache on every expense mutation too.
    cacheService.delByPrefix(`chat:get_inflation_shield:${accountId}:`),
    cacheService.del(`uc:${accountId}`),
  ]);
}
