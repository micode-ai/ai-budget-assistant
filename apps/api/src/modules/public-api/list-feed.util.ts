import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { decodeCursor, encodeCursor, invalidCursor } from './cursor.util';
import { isDateOnly } from './dto/public-expense.dto';

/**
 * The list and changes-feed mechanics shared by every public resource that is paged by date
 * (expenses, incomes): the cursors, the keyset predicates, the page arithmetic and the feed's
 * safety lag. The results are plain `where` fragments, structurally valid for any model with
 * `date`, `description`, `notes`, `updatedAt` and `id` columns. The lag/horizon logic lives ONLY
 * here, so no resource can drift from the platform invariant.
 */

export const utcDay = (d: string): Date => new Date(`${d}T00:00:00.000Z`);
export const CURSOR_ID = /^[0-9A-Za-z-]{1,64}$/;

// ── list (date desc, id desc) ───────────────────────────────────────────────

/** Inclusive date range as a Prisma filter, or `undefined` when neither bound is given. */
export function dateRangeFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const date: Prisma.DateTimeFilter = {};
  if (from) date.gte = utcDay(from);
  if (to) date.lte = utcDay(to);
  return date;
}

/** Case-insensitive "contains" on the description or the notes. */
export function descriptionSearchWhere(search: string) {
  return {
    OR: [
      { description: { contains: search, mode: 'insensitive' as const } },
      { notes: { contains: search, mode: 'insensitive' as const } },
    ],
  };
}

/** Rows strictly after the list cursor `(date, id)` in `date desc, id desc` order. Throws `invalid_cursor`. */
export function listCursorWhere(cursor: string) {
  const [cDate, cId] = decodeCursor(cursor, 2);
  if (!isDateOnly(cDate) || !CURSOR_ID.test(cId)) throw invalidCursor();
  const d = utcDay(cDate);
  return { OR: [{ date: { lt: d } }, { date: d, id: { lt: cId } }] };
}

/** Trims the `limit + 1` fetch to a page; the cursor is the last row's `(date, id)` while more follow. */
export function listPage<T extends { id: string; date: Date }>(
  fetched: T[],
  limit: number,
): { page: T[]; hasMore: boolean; nextCursor: string | null } {
  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor([last.date.toISOString().slice(0, 10), last.id]) : null;
  return { page, hasMore, nextCursor };
}

// ── changes feed ((updatedAt, id) ascending) ────────────────────────────────

/** Exactly what `Date#toISOString()` produces: UTC, millisecond precision, `Z`. */
export const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Ids in the feed cursor; empty is allowed — it is the "from the beginning" start cursor. */
export const FEED_CURSOR_ID = /^[0-9A-Za-z-]{0,64}$/;
/**
 * The cursor handed out on an empty first page (no input cursor, no rows yet). Every real row
 * sorts after it — any `updatedAt` is later than the epoch, and at the epoch any id is greater
 * than `''` — so it behaves exactly like "no cursor" and the client can store it.
 */
export const START_CURSOR_PARTS = [new Date(0).toISOString(), ''];

/**
 * Safety lag of the changes feed (Ruling 21). `@updatedAt` is stamped when Prisma builds the
 * statement, not when the transaction commits, so a slow transaction can commit a row whose
 * `updatedAt` is already behind a cursor a client has paged past — and keyset paging would then
 * skip it forever. Only rows at least this old (by the DATABASE clock) are served, which gives any
 * in-flight transaction this long to commit before its rows can be paged past.
 */
export const PUBLIC_CHANGES_SAFETY_LAG_MS = 10_000;

/** Rows strictly after the feed cursor `(updatedAt, id)`. Throws `invalid_cursor`. */
export function feedAfterWhere(cursor: string) {
  const [cAt, cId] = decodeCursor(cursor, 2);
  if (!ISO_MS.test(cAt) || !FEED_CURSOR_ID.test(cId)) throw invalidCursor();
  const at = new Date(cAt);
  // Round-trip check rejects impossible dates (`2026-02-30T…` normalises to March).
  if (Number.isNaN(at.getTime()) || at.toISOString() !== cAt) throw invalidCursor();
  return { OR: [{ updatedAt: { gt: at } }, { updatedAt: at, id: { gt: cId } }] };
}

/**
 * Newest `updatedAt` the feed may serve: the DB clock minus the safety lag. The lag is measured on
 * the DATABASE clock (one `SELECT now()` per request), never the app server's, so clock skew
 * between API and Postgres cannot shrink it. Rows still inside the window are not fetched at all,
 * so `next_cursor` — the last RETURNED row, or the input cursor on an empty page — can never move
 * past them, and `has_more` does not count them.
 */
export async function feedHorizon(prisma: PrismaService): Promise<Date> {
  const [{ now: dbNow }] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
  return new Date(dbNow.getTime() - PUBLIC_CHANGES_SAFETY_LAG_MS);
}

/** Trims the `limit + 1` fetch; on an empty page `nextCursor` is the input cursor (or the start cursor). */
export function feedPage<T extends { id: string; updatedAt: Date }>(
  fetched: T[],
  limit: number,
  inputCursor: string | undefined,
): { page: T[]; hasMore: boolean; nextCursor: string } {
  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;
  const last = page[page.length - 1];
  const nextCursor = last
    ? encodeCursor([last.updatedAt.toISOString(), last.id])
    : (inputCursor ?? encodeCursor(START_CURSOR_PARTS));
  return { page, hasMore, nextCursor };
}
