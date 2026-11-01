import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { sniffReceiptContentType } from '../receipt-split/helpers/receipt-content-type';
import { decodeCursor, encodeCursor, invalidCursor } from './cursor.util';
import {
  isDateOnly,
  PUBLIC_CHANGES_DEFAULT_LIMIT,
  PUBLIC_EXPENSES_DEFAULT_LIMIT,
  type ListPublicExpensesQueryDto,
} from './dto/public-expense.dto';
import type { PublicExpenseRow } from './mappers/public-expense.mapper';
import { PublicApiError } from './public-api-error';

/**
 * The public API's expense READS go straight to Prisma (writes still go through `ExpensesService`):
 * `ExpensesService.findAll` is offset-paginated, has no merchant/project filter, and selects
 * internal columns. Every query here is account-scoped and excludes `isPlanned` (not spend, never
 * visible publicly).
 *
 * Never selects `receiptImage` — that column holds a whole photo/PDF. `has_receipt` comes from
 * `attachReceiptFlags`, a second query on `receiptImage IS NOT NULL`, which Postgres answers from
 * the tuple's null bitmap without fetching the TOASTed bytes. That is the same predicate the app
 * itself uses to decide "has a receipt" (`getReceiptImage`, the guest split page); `receiptMimeType`
 * is NOT a reliable proxy — it can be null on a row that has bytes (e.g. carried by a cross-account
 * merge from an older row), and a stale mime on a row whose bytes were cleared would claim a
 * receipt the receipt endpoint then 404s.
 */

/** Columns + pre-filtered relations the mapper reads; shared by list, detail and (Task 9) the changes feed. */
export const PUBLIC_EXPENSE_SELECT = {
  id: true,
  userId: true,
  amount: true,
  currencyCode: true,
  date: true,
  time: true,
  categoryId: true,
  description: true,
  merchant: true,
  notes: true,
  locationLat: true,
  locationLng: true,
  locationName: true,
  discountAmount: true,
  depositAmount: true,
  isDebt: true,
  isDebtRepayment: true,
  isSplitReceivable: true,
  isRecurring: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true } },
  createdByOAuthClient: { select: { clientId: true, name: true } },
  expenseTags: {
    where: { isDeleted: false, tag: { isDeleted: false } },
    orderBy: { createdAt: 'asc' },
    select: { tag: { select: { id: true, name: true } } },
  },
  projectExpenses: {
    where: { isDeleted: false, project: { isDeleted: false } },
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: { project: { select: { id: true, name: true } } },
  },
  categorySplits: {
    where: { isDeleted: false },
    orderBy: { createdAt: 'asc' },
    select: { categoryId: true, amount: true },
  },
} satisfies Prisma.ExpenseSelect;

/** `PUBLIC_EXPENSE_SELECT` plus the live line items — detail and the changes feed. */
export const PUBLIC_EXPENSE_DETAIL_SELECT = {
  ...PUBLIC_EXPENSE_SELECT,
  items: {
    where: { isDeleted: false },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      lineDiscount: true,
      categoryId: true,
    },
  },
} satisfies Prisma.ExpenseSelect;

type SelectedRow = Prisma.ExpenseGetPayload<{ select: typeof PUBLIC_EXPENSE_SELECT }>;
type SelectedDetailRow = Prisma.ExpenseGetPayload<{ select: typeof PUBLIC_EXPENSE_DETAIL_SELECT }>;

// Compile-time proof the selects feed the mapper (a select edit that breaks it fails typecheck here).
type _ListFeedsMapper = SelectedRow & { hasReceipt: boolean } extends PublicExpenseRow ? true : never;
type _DetailFeedsMapper = SelectedDetailRow & { hasReceipt: boolean } extends PublicExpenseRow ? true : never;
const _assertList: _ListFeedsMapper = true;
const _assertDetail: _DetailFeedsMapper = true;
void _assertList;
void _assertDetail;

export interface PublicExpensePage {
  rows: PublicExpenseRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

type ListQuery = Pick<
  ListPublicExpensesQueryDto,
  'date_from' | 'date_to' | 'category_id' | 'merchant' | 'project_id' | 'search' | 'limit' | 'cursor'
>;

const utcDay = (d: string): Date => new Date(`${d}T00:00:00.000Z`);
const CURSOR_ID = /^[0-9A-Za-z-]{1,64}$/;

/**
 * One page of the account's expenses, `date desc, id desc`, keyset-paginated over `(date, id)`:
 * the cursor is the last row's `(date, id)` and the next page is every row strictly after it in
 * that order. Fetches `limit + 1` rows to know `has_more` without a count.
 */
export async function listPublicExpenses(prisma: PrismaService, accountId: string, q: ListQuery): Promise<PublicExpensePage> {
  const limit = q.limit ?? PUBLIC_EXPENSES_DEFAULT_LIMIT;

  const where: Prisma.ExpenseWhereInput = { accountId, isDeleted: false, isPlanned: false };
  const and: Prisma.ExpenseWhereInput[] = [];

  if (q.date_from || q.date_to) {
    const date: Prisma.DateTimeFilter = {};
    if (q.date_from) date.gte = utcDay(q.date_from);
    if (q.date_to) date.lte = utcDay(q.date_to);
    where.date = date;
  }
  if (q.category_id) where.categoryId = q.category_id;
  if (q.merchant) where.merchant = { contains: q.merchant, mode: 'insensitive' };
  if (q.project_id) where.projectExpenses = { some: { projectId: q.project_id, isDeleted: false } };
  if (q.search) {
    and.push({
      OR: [
        { description: { contains: q.search, mode: 'insensitive' } },
        { notes: { contains: q.search, mode: 'insensitive' } },
      ],
    });
  }
  if (q.cursor !== undefined) {
    const [cDate, cId] = decodeCursor(q.cursor, 2);
    if (!isDateOnly(cDate) || !CURSOR_ID.test(cId)) throw invalidCursor();
    const d = utcDay(cDate);
    and.push({ OR: [{ date: { lt: d } }, { date: d, id: { lt: cId } }] });
  }
  if (and.length > 0) where.AND = and;

  const fetched = await prisma.expense.findMany({
    where,
    select: PUBLIC_EXPENSE_SELECT,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor([last.date.toISOString().slice(0, 10), last.id]) : null;

  return { rows: await attachReceiptFlags(prisma, accountId, page), nextCursor, hasMore };
}

/**
 * One live, non-planned expense of the account by its SERVER id (never `clientId`), with line
 * items. Anything else — missing, deleted, planned, another account's — is `404 not_found`, so
 * the response never tells which.
 */
export async function getPublicExpense(prisma: PrismaService, accountId: string, id: string): Promise<PublicExpenseRow> {
  const row = await prisma.expense.findFirst({
    where: { id, accountId, isDeleted: false, isPlanned: false },
    select: PUBLIC_EXPENSE_DETAIL_SELECT,
  });
  if (!row) throw new PublicApiError(404, 'not_found', 'Expense not found.');
  const [withFlag] = await attachReceiptFlags(prisma, accountId, [row]);
  return withFlag;
}

// ── changes feed ────────────────────────────────────────────────────────────

/** Exactly what `Date#toISOString()` produces: UTC, millisecond precision, `Z`. */
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Ids in the feed cursor; empty is allowed — it is the "from the beginning" start cursor. */
const FEED_CURSOR_ID = /^[0-9A-Za-z-]{0,64}$/;
/**
 * The cursor handed out on an empty first page (no input cursor, no rows yet). Every real row
 * sorts after it — any `updatedAt` is later than the epoch, and at the epoch any id is greater
 * than `''` — so it behaves exactly like "no cursor" and the client can store it.
 */
const START_CURSOR_PARTS = [new Date(0).toISOString(), ''];

/**
 * Safety lag of the changes feed (Ruling 21). `@updatedAt` is stamped when Prisma builds the
 * statement, not when the transaction commits, so a slow transaction can commit a row whose
 * `updatedAt` is already behind a cursor a client has paged past — and keyset paging would then
 * skip it forever. Only rows at least this old (by the DATABASE clock) are served, which gives any
 * in-flight transaction this long to commit before its rows can be paged past.
 */
export const PUBLIC_CHANGES_SAFETY_LAG_MS = 10_000;

const PUBLIC_EXPENSE_CHANGES_SELECT = {
  ...PUBLIC_EXPENSE_DETAIL_SELECT,
  isDeleted: true,
  isPlanned: true,
} satisfies Prisma.ExpenseSelect;

export type PublicExpenseChange =
  | { type: 'upsert'; row: PublicExpenseRow }
  | { type: 'delete'; id: string; deletedAt: Date };

export interface PublicExpenseChangesPage {
  changes: PublicExpenseChange[];
  /** Always set — on an empty page it equals the input cursor, so the client can store it. */
  nextCursor: string;
  hasMore: boolean;
}

/**
 * One page of the account's incremental change feed: every expense row (deleted and planned
 * included) whose `(updatedAt, id)` is strictly greater than the cursor tuple, ascending.
 *
 * - A live, non-planned row is an `upsert` with its line items (the detail shape).
 * - A soft-deleted row is a `delete` with `deleted_at` = its `updatedAt` (the soft delete bumps it).
 * - A PLANNED row is also a `delete`: a planned expense is not spend and never visible publicly,
 *   so an expense that turns planned must disappear from the integrator's copy. A row that was
 *   planned from birth and never visible shows up as a delete of an id the client never saw —
 *   accepted on purpose, since deleting an unknown id is a no-op for a client, and telling the
 *   two cases apart would need history the table does not keep.
 *
 * Cursor = the last row's `(updatedAt as ISO-8601 with ms, id)`. `expenses.updated_at` is
 * `timestamp(3)` and Prisma hands back a JS `Date` (also ms precision), so the ISO string IS the
 * exact DB value and the strict `>` neither skips nor repeats rows that share an `updatedAt`
 * across a page boundary — the `id` tie-break orders those. Served by
 * `@@index([accountId, updatedAt, id])`.
 *
 * A row edited while a client pages gets a new `updatedAt` and so moves to the end of the feed:
 * the client sees it again later with its latest state. That is the intended semantics; no
 * snapshot transaction is needed.
 *
 * Edits that only write a child table (line items, tags, project link, splits) bump the parent's
 * `updatedAt` through `touchExpenses` (modules/expenses/expense-touch.util.ts), which is what
 * makes them surface here.
 */
export async function listPublicExpenseChanges(
  prisma: PrismaService,
  accountId: string,
  q: { cursor?: string; limit?: number },
): Promise<PublicExpenseChangesPage> {
  const limit = q.limit ?? PUBLIC_CHANGES_DEFAULT_LIMIT;
  let after: Prisma.ExpenseWhereInput | undefined;
  if (q.cursor !== undefined) {
    const [cAt, cId] = decodeCursor(q.cursor, 2);
    if (!ISO_MS.test(cAt) || !FEED_CURSOR_ID.test(cId)) throw invalidCursor();
    const at = new Date(cAt);
    // Round-trip check rejects impossible dates (`2026-02-30T…` normalises to March).
    if (Number.isNaN(at.getTime()) || at.toISOString() !== cAt) throw invalidCursor();
    after = { OR: [{ updatedAt: { gt: at } }, { updatedAt: at, id: { gt: cId } }] };
  }

  // The lag is measured on the DB clock (one `SELECT now()` per request), never the app server's,
  // so clock skew between API and Postgres cannot shrink it. Rows still inside the window are not
  // fetched at all, so `next_cursor` — the last RETURNED row, or the input cursor on an empty page —
  // can never move past them, and `has_more` does not count them.
  const [{ now: dbNow }] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
  const settledBefore = new Date(dbNow.getTime() - PUBLIC_CHANGES_SAFETY_LAG_MS);
  const where: Prisma.ExpenseWhereInput = { accountId, updatedAt: { lte: settledBefore } };
  if (after) where.AND = [after];

  const fetched = await prisma.expense.findMany({
    where,
    select: PUBLIC_EXPENSE_CHANGES_SELECT,
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });

  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;
  const last = page[page.length - 1];
  const nextCursor = last
    ? encodeCursor([last.updatedAt.toISOString(), last.id])
    : (q.cursor ?? encodeCursor(START_CURSOR_PARTS));

  const live = page.filter((r) => !r.isDeleted && !r.isPlanned);
  const flagged = new Map((await attachReceiptFlags(prisma, accountId, live)).map((r) => [r.id, r]));

  const changes: PublicExpenseChange[] = page.map((r) => {
    const row = flagged.get(r.id);
    if (!row) return { type: 'delete', id: r.id, deletedAt: r.updatedAt };
    // Drop the feed-only flags so the mapper sees exactly the detail row shape.
    const { isDeleted: _d, isPlanned: _p, ...detail } = row;
    return { type: 'upsert', row: detail };
  });

  return { changes, nextCursor, hasMore };
}

// ── receipt download ────────────────────────────────────────────────────────

const RECEIPT_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

export interface PublicReceiptFile {
  /** The row's server id, for the download filename — never the raw route param. */
  id: string;
  bytes: Buffer;
  contentType: string;
  extension: string;
}

/**
 * The original receipt bytes of one live, non-planned expense of the account (server id only).
 * Missing / deleted / planned / another account's / no image → `404 not_found`, indistinguishably.
 *
 * `Content-Type` is SNIFFED from the bytes (`sniffReceiptContentType`, shared with the guest split
 * page), never taken from `receiptMimeType`: that column is a bare `@IsString()` any app user can
 * set, and echoing it would let them pick how a browser renders a file served from our API origin.
 * Bytes the sniffer cannot identify are served as `application/octet-stream` (a download, never
 * rendered) rather than refused — this is the account's own data behind a scoped token, so
 * withholding it would help no one.
 */
export async function getPublicReceipt(prisma: PrismaService, accountId: string, id: string): Promise<PublicReceiptFile> {
  const row = await prisma.expense.findFirst({
    where: { id, accountId, isDeleted: false, isPlanned: false },
    select: { id: true, receiptImage: true },
  });
  if (!row?.receiptImage) throw new PublicApiError(404, 'not_found', 'Receipt not found.');
  const bytes = Buffer.from(row.receiptImage);
  const contentType = sniffReceiptContentType(bytes) ?? 'application/octet-stream';
  return { id: row.id, bytes, contentType, extension: RECEIPT_EXTENSIONS[contentType] ?? 'bin' };
}

/** Adds `hasReceipt` from `receiptImage IS NOT NULL` in one query for the whole page; never loads the bytes. */
export async function attachReceiptFlags<T extends { id: string }>(
  prisma: PrismaService,
  accountId: string,
  rows: T[],
): Promise<Array<T & { hasReceipt: boolean }>> {
  if (rows.length === 0) return [];
  const withReceipt = await prisma.expense.findMany({
    where: { accountId, id: { in: rows.map((r) => r.id) }, receiptImage: { not: null } },
    select: { id: true },
  });
  const ids = new Set(withReceipt.map((r) => r.id));
  return rows.map((r) => ({ ...r, hasReceipt: ids.has(r.id) }));
}
