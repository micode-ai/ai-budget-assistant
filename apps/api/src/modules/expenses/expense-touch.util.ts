import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Bumps `Expense.updatedAt` on the account's expense(s) matching `where`, after a write to a
 * CHILD row (line item, tag link, project link, category split) that changes what the expense
 * shows but never touches the expense row itself.
 *
 * Why: `GET /public/v1/expenses/changes` (and `/sync/pull`) find changed expenses by
 * `updatedAt`. An edit that only writes a child table leaves the parent's `updatedAt` alone, so
 * the integrator's feed would never re-deliver the expense and its copy would silently keep the
 * old line items / tags / project / splits.
 *
 * `updateMany`, not `update`: a sync relation change can name an expense that is not (or no
 * longer) in this account — that must be a no-op here, not a thrown P2025 that turns a child write
 * that already succeeded into an error. `accountId` is always part of the filter, so a child row
 * pointing at another account's expense can never bump that expense.
 *
 * Does NOT touch `syncVersion`: the expense row's own content did not change, and incrementing it
 * would make the app's next push of that row a version conflict.
 */
export async function touchExpenses(
  client: Pick<PrismaClient, 'expense'> | Pick<Prisma.TransactionClient, 'expense'>,
  accountId: string,
  where: Omit<Prisma.ExpenseWhereInput, 'accountId'>,
): Promise<void> {
  // Prisma drops an `undefined` filter value, which would turn `{ id: undefined }` into "every
  // expense of the account". Refuse that instead of bumping the whole account.
  if (Object.values(where).some((v) => v === undefined)) return;
  await client.expense.updateMany({ where: { ...where, accountId }, data: { updatedAt: new Date() } });
}
