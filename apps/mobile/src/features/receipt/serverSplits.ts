import type { ExpenseCategorySplit } from '@budget/shared-types';

/**
 * A receipt's category breakdown as the SERVER sends it, mapped into the shape
 * the app renders.
 *
 * Why this exists: every place that reads a split — `expenseSync`'s
 * `attachSplits` and the expense-detail card's `getSplitsForExpense` — reads
 * the local SQLite table. On web `executeSql` resolves to `[]` by design, so
 * those reads always come back empty and the whole category-split feature has
 * been invisible in the browser since it shipped, even though `findAll`
 * already includes `categorySplits` in its response. `db/client.web.ts` states
 * the rule this restores: "Stores are expected to fall back to the API
 * response when this returns no rows."
 *
 * The fallback is deliberately one-directional. Native keeps reading SQLite
 * first, because a split the user edited offline is authoritative there and
 * has not reached the server yet; the server's copy is only used when the
 * local table has nothing to say.
 *
 * Returns `undefined` rather than `[]` for an absent or empty list, so a caller
 * can tell "the server sent no splits" from "the server sent some" — an empty
 * array reads as the latter and would wrongly overwrite a local set.
 */
export function mapServerSplits(
  rows: unknown,
  expenseId: string,
): ExpenseCategorySplit[] | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;

  return rows.map((raw) => {
    const row = raw as Record<string, any>;
    return {
      id: String(row.id ?? ''),
      // The LOCAL id: the app addresses every row by its clientId, and a split
      // carrying the server's expense id would match nothing on screen.
      expenseId,
      categoryId: String(row.categoryId ?? ''),
      category: row.category ?? undefined,
      // Prisma Decimal columns arrive as strings over the wire.
      amount: Number(row.amount ?? 0),
      percentage: Number(row.percentage ?? 0),
      notes: row.notes ?? undefined,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
      isDeleted: false,
    } as ExpenseCategorySplit;
  });
}
