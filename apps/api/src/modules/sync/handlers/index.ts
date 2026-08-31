import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';
import { processExpenseChange } from './expense.handler';
import { processExpenseItemChange } from './expense-item.handler';
import { processBudgetChange } from './budget.handler';
import { processCategoryChange } from './category.handler';
import { processIncomeChange } from './income.handler';
import { processTagChange } from './tag.handler';
import { processProjectChange } from './project.handler';
import { processShoppingListChange } from './shopping-list.handler';
import { processShoppingListItemChange } from './shopping-list-item.handler';
import { processPortfolioHoldingChange } from './portfolio-holding.handler';
import { processInvestmentTransactionChange } from './investment-transaction.handler';
import { processTripExpenseShareChange } from './trip-expense-share.handler';

export {
  processExpenseChange,
  processExpenseItemChange,
  processBudgetChange,
  processCategoryChange,
  processIncomeChange,
  processTagChange,
  processProjectChange,
  processShoppingListChange,
  processShoppingListItemChange,
  processPortfolioHoldingChange,
  processInvestmentTransactionChange,
  processTripExpenseShareChange,
};

type SingleEntityHandler = (
  ctx: SyncHandlerContext,
  accountId: string,
  userId: string,
  change: SyncChange,
) => Promise<SyncResult>;

/**
 * Registry of the per-entity sync handlers keyed by `entityType`, looked up
 * by SyncService.processChange instead of a growing switch statement.
 * Relation types (expense_tag/income_tag/project_expense/project_income/
 * expense_category_split) are handled separately by
 * SyncService.processRelationChange — they share one method because each
 * branch is a thin, near-identical junction-table upsert, not an
 * independently-evolving entity.
 *
 * `as SingleEntityHandler` casts are needed because each handler's `change`
 * parameter is narrowed via `Extract<SyncChange, {entityType: '...'}>`,
 * which is a stricter (contravariant) function type than the loose
 * `SyncChange` the map declares — the runtime dispatch in processChange
 * already guarantees the right shape reaches the right handler.
 */
// Every handler takes the uniform (ctx, accountId, userId, change) shape —
// including the ones that don't need userId (budget/category/tag/project/
// tripExpenseShare) — so a single positional call in processChange can
// dispatch to any of them without shifting arguments.
export const SYNC_ENTITY_HANDLERS: Partial<Record<SyncChange['entityType'], SingleEntityHandler>> = {
  expense: processExpenseChange as SingleEntityHandler,
  expense_item: processExpenseItemChange as SingleEntityHandler,
  budget: processBudgetChange as SingleEntityHandler,
  category: processCategoryChange as SingleEntityHandler,
  income: processIncomeChange as SingleEntityHandler,
  tag: processTagChange as SingleEntityHandler,
  project: processProjectChange as SingleEntityHandler,
  portfolio_holding: processPortfolioHoldingChange as SingleEntityHandler,
  investment_transaction: processInvestmentTransactionChange as SingleEntityHandler,
  tripExpenseShare: processTripExpenseShareChange as SingleEntityHandler,
  shopping_list: processShoppingListChange as SingleEntityHandler,
  shopping_list_item: processShoppingListItemChange as SingleEntityHandler,
};
