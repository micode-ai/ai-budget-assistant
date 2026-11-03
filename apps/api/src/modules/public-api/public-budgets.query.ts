import type { PrismaService } from '../../database/prisma.service';
import type { BudgetsService } from '../budgets/budgets.service';
import type { PublicBudgetRow } from './mappers/public-budget.mapper';
import { PublicApiError } from './public-api-error';

/**
 * The public API's budget READS. Budgets are few per account, so there is no pagination and no
 * changes feed. The rows and the progress both come from `BudgetsService` — the same computation
 * the app shows — with the account's financial-month anchor applied; nothing is recomputed here.
 *
 * Progress is always included, on the list too: it costs one aggregate (plus one group-by) per
 * budget, run in parallel. TODO measure: switch to `include=progress` only if a list of 20 budgets
 * takes over 500 ms locally.
 */

type Progress = Awaited<ReturnType<BudgetsService['getProgress']>>;

function toRow(budget: Omit<PublicBudgetRow, 'progress'>, p: Progress): PublicBudgetRow {
  return {
    id: budget.id,
    name: budget.name,
    amount: budget.amount,
    currencyCode: budget.currencyCode,
    period: budget.period,
    startDate: budget.startDate,
    endDate: budget.endDate,
    alertThreshold: budget.alertThreshold,
    isActive: budget.isActive,
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
    categoryAllocations: budget.categoryAllocations,
    progress: {
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      spent: p.spent,
      remaining: p.remaining,
      percentageUsed: p.percentageUsed,
      projectedTotal: p.projectedTotal,
    },
  };
}

/**
 * The id of a live budget of the account by its SERVER id (never `clientId`, which
 * `BudgetsService.findOne` would also accept). Anything else is `404 not_found`.
 */
export async function requirePublicBudgetId(
  prisma: PrismaService,
  accountId: string,
  id: string
): Promise<string> {
  const row = await prisma.budget.findFirst({
    where: { id, accountId, isDeleted: false },
    select: { id: true },
  });
  if (!row) throw new PublicApiError(404, 'not_found', 'Budget not found.');
  return row.id;
}

export async function listPublicBudgets(
  budgets: BudgetsService,
  accountId: string
): Promise<PublicBudgetRow[]> {
  const [rows, anchorDay] = await Promise.all([
    budgets.findAll(accountId),
    budgets.getAccountAnchorDay(accountId),
  ]);
  return Promise.all(
    rows.map(async (b) => toRow(b, await budgets.getProgress(accountId, b.id, anchorDay)))
  );
}

export async function getPublicBudget(
  prisma: PrismaService,
  budgets: BudgetsService,
  accountId: string,
  id: string
): Promise<PublicBudgetRow> {
  const budgetId = await requirePublicBudgetId(prisma, accountId, id);
  const anchorDay = await budgets.getAccountAnchorDay(accountId);
  const progress = await budgets.getProgress(accountId, budgetId, anchorDay);
  return toRow(progress.budget, progress);
}
