import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Bumps `Income.updatedAt` on the account's income(s) matching `where`, after a write to a CHILD
 * row (tag link, project link) that changes what the income shows but never touches the income
 * row itself. Mirror of `touchExpenses` (modules/expenses/expense-touch.util.ts), for the public
 * incomes changes feed.
 *
 * `updateMany`, not `update`: a sync relation change can name an income that is not (or no longer)
 * in this account — that must be a no-op, not a thrown P2025. `accountId` is always part of the
 * filter, so a child row pointing at another account's income can never bump it.
 *
 * Does NOT touch `syncVersion`: the income row's own content did not change, and incrementing it
 * would make the app's next push of that row a version conflict.
 */
export async function touchIncomes(
  client: Pick<PrismaClient, 'income'> | Pick<Prisma.TransactionClient, 'income'>,
  accountId: string,
  where: Omit<Prisma.IncomeWhereInput, 'accountId'>,
): Promise<void> {
  // Prisma drops an `undefined` filter value, which would turn `{ id: undefined }` into "every
  // income of the account". Refuse that instead of bumping the whole account.
  if (Object.values(where).some((v) => v === undefined)) return;
  await client.income.updateMany({ where: { ...where, accountId }, data: { updatedAt: new Date() } });
}
