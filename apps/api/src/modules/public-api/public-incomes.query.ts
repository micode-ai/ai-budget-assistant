import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { PUBLIC_CHANGES_DEFAULT_LIMIT, PUBLIC_EXPENSES_DEFAULT_LIMIT } from './dto/public-expense.dto';
import type { ListPublicIncomesQueryDto } from './dto/public-income.dto';
import {
  dateRangeFilter,
  descriptionSearchWhere,
  feedAfterWhere,
  feedHorizon,
  feedPage,
  listCursorWhere,
  listPage,
} from './list-feed.util';
import type { PublicIncomeRow } from './mappers/public-income.mapper';
import { PublicApiError } from './public-api-error';

/**
 * The public API's income READS, straight to Prisma like the expense reads
 * (`public-expenses.query.ts`); the cursors, keyset predicates, page arithmetic and the feed safety lag are shared in `list-feed.util.ts`.
 * Every query is account-scoped. Incomes have no `isPlanned`: every live row is visible.
 */

/** Columns + pre-filtered relations the mapper reads; shared by list, detail and the changes feed. */
export const PUBLIC_INCOME_SELECT = {
  id: true,
  amount: true,
  currencyCode: true,
  date: true,
  description: true,
  notes: true,
  source: true,
  isDebt: true,
  isDebtRepayment: true,
  isSplitReceivable: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  linkedTransfer: { select: { id: true } },
  createdByOAuthClient: { select: { clientId: true, name: true } },
  incomeTags: {
    where: { isDeleted: false, tag: { isDeleted: false } },
    orderBy: { createdAt: 'asc' },
    select: { tag: { select: { id: true, name: true } } },
  },
  projectIncomes: {
    where: { isDeleted: false, project: { isDeleted: false } },
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: { project: { select: { id: true, name: true } } },
  },
} satisfies Prisma.IncomeSelect;

type SelectedRow = Prisma.IncomeGetPayload<{ select: typeof PUBLIC_INCOME_SELECT }>;

// Compile-time proof the select feeds the mapper (a select edit that breaks it fails typecheck here).
type _FeedsMapper = SelectedRow extends PublicIncomeRow ? true : never;
const _assertFeeds: _FeedsMapper = true;
void _assertFeeds;

export interface PublicIncomePage {
  rows: PublicIncomeRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

type ListQuery = Pick<
  ListPublicIncomesQueryDto,
  'date_from' | 'date_to' | 'category_id' | 'project_id' | 'search' | 'limit' | 'cursor'
>;

/**
 * One page of the account's incomes, `date desc, id desc`, keyset-paginated over `(date, id)`
 * exactly like the expense list. Fetches `limit + 1` rows to know `has_more` without a count.
 */
export async function listPublicIncomes(
  prisma: PrismaService,
  accountId: string,
  q: ListQuery
): Promise<PublicIncomePage> {
  const limit = q.limit ?? PUBLIC_EXPENSES_DEFAULT_LIMIT;

  const where: Prisma.IncomeWhereInput = { accountId, isDeleted: false };
  const and: Prisma.IncomeWhereInput[] = [];

  const date = dateRangeFilter(q.date_from, q.date_to);
  if (date) where.date = date;
  if (q.category_id) where.categoryId = q.category_id;
  if (q.project_id) where.projectIncomes = { some: { projectId: q.project_id, isDeleted: false } };
  if (q.search) and.push(descriptionSearchWhere(q.search));
  if (q.cursor !== undefined) and.push(listCursorWhere(q.cursor));
  if (and.length > 0) where.AND = and;

  const fetched = await prisma.income.findMany({
    where,
    select: PUBLIC_INCOME_SELECT,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const { page, hasMore, nextCursor } = listPage(fetched, limit);

  return { rows: page, nextCursor, hasMore };
}

/**
 * One live income of the account by its SERVER id (never `clientId`). Anything else — missing,
 * deleted, another account's — is `404 not_found`, so the response never tells which.
 */
export async function getPublicIncome(
  prisma: PrismaService,
  accountId: string,
  id: string
): Promise<PublicIncomeRow> {
  const row = await prisma.income.findFirst({
    where: { id, accountId, isDeleted: false },
    select: PUBLIC_INCOME_SELECT,
  });
  if (!row) throw new PublicApiError(404, 'not_found', 'Income not found.');
  return row;
}

// ── changes feed ────────────────────────────────────────────────────────────

const PUBLIC_INCOME_CHANGES_SELECT = {
  ...PUBLIC_INCOME_SELECT,
  isDeleted: true,
} satisfies Prisma.IncomeSelect;

export type PublicIncomeChange =
  | { type: 'upsert'; row: PublicIncomeRow }
  | { type: 'delete'; id: string; deletedAt: Date };

export interface PublicIncomeChangesPage {
  changes: PublicIncomeChange[];
  /** Always set — on an empty page it equals the input cursor, so the client can store it. */
  nextCursor: string;
  hasMore: boolean;
}

/**
 * The income change feed: every income row (deleted included) whose `(updatedAt, id)` is strictly
 * greater than the cursor tuple, ascending, served only once it is older than the safety lag on the
 * DATABASE clock. Same keyset, lag and cursor rules as `listPublicExpenseChanges` (see there for the
 * why); a soft-deleted row is a `delete` with `deleted_at` = its `updatedAt`. Served by
 * `@@index([accountId, updatedAt, id])`. Child edits (tags, project) bump the parent's `updatedAt`
 * through the income write paths.
 */
export async function listPublicIncomeChanges(
  prisma: PrismaService,
  accountId: string,
  q: { cursor?: string; limit?: number }
): Promise<PublicIncomeChangesPage> {
  const limit = q.limit ?? PUBLIC_CHANGES_DEFAULT_LIMIT;
  const after = q.cursor !== undefined ? feedAfterWhere(q.cursor) : undefined;
  const settledBefore = await feedHorizon(prisma);
  const where: Prisma.IncomeWhereInput = { accountId, updatedAt: { lte: settledBefore } };
  if (after) where.AND = [after];

  const fetched = await prisma.income.findMany({
    where,
    select: PUBLIC_INCOME_CHANGES_SELECT,
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });

  const { page, hasMore, nextCursor } = feedPage(fetched, limit, q.cursor);

  const changes: PublicIncomeChange[] = page.map((r) => {
    if (r.isDeleted) return { type: 'delete', id: r.id, deletedAt: r.updatedAt };
    const { isDeleted: _d, ...row } = r;
    return { type: 'upsert', row };
  });

  return { changes, nextCursor, hasMore };
}
