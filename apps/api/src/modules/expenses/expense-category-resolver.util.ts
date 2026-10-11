import { Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const logger = new Logger('CategoryResolver');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CategoryKind = 'expense' | 'income';

/**
 * Resolve a client-supplied category reference to one of THIS account's
 * category ids.
 *
 * The client may address a category by: the server PK, its own local id (which
 * it also sends as `clientId` when it creates one), a plain name, or a seeded
 * `default-exp-...` id. Shared by ExpensesService (create/update),
 * ExpenseBulkService and IncomesService, which previously each carried their
 * own copy — the incomes one matched names across EVERY account, and accepted
 * any account's UUID (ABA-566).
 *
 * Returns `null` when nothing matches. Callers on a PATCH path must use
 * `resolveCategoryIdForUpdate` instead, because `null` there means "erase the
 * category" and would destroy data (see that function).
 */
export async function resolveExpenseCategoryId(
  prisma: PrismaService,
  categoryId: string | undefined | null,
  accountId: string,
  kind: CategoryKind = 'expense',
): Promise<string | null> {
  if (!categoryId) return null;

  if (UUID_RE.test(categoryId)) {
    const owned = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, accountId: true, type: true },
    });
    // An income can never sit in an expense category or vice versa; a PK of
    // the other kind is treated as unresolvable rather than stored.
    if (owned?.accountId === accountId && (!owned.type || owned.type === kind)) return owned.id;

    // Not a server PK of this account. The mobile addresses a category by its
    // LOCAL id for the row's whole life and sends that same value as
    // `clientId` on create (ABA-564), so the string may still identify one of
    // this account's rows that way. Without this lookup a perfectly valid
    // categorisation from an offline-first client resolved to nothing.
    const byClientId = await prisma.category.findFirst({
      where: { accountId, clientId: categoryId },
      select: { id: true },
    });
    if (byClientId) return byClientId.id;

    logger.warn(
      `Unresolvable category id ${categoryId} for account ${accountId} - neither a category of this account nor a known clientId`,
    );
    return null;
  }

  // Exact name match scoped to this account AND this kind, a live row before a
  // deleted one. The mobile pushes a category by NAME on its pending-sync path,
  // and an account can hold the same name twice — e.g. a deleted expense
  // category beside a live income one. Unfiltered, `findFirst` returned the
  // deleted expense row, and every income re-sent with that name was filed
  // under it: the phone then pulled an id it has no income category for and
  // showed the incomes uncategorised again after each re-assignment (ABA-666).
  // A deleted row is still matched as a last resort rather than excluded:
  // `@@unique([accountId, name, type])` would make the auto-create below
  // collide with it.
  const category = await prisma.category.findFirst({
    where: { accountId, type: kind, name: { equals: categoryId, mode: 'insensitive' } },
    orderBy: { isDeleted: 'asc' },
  });
  if (category) return category.id;

  // Handle mobile default IDs (e.g. "default-exp-bills---utilities" → search "bills", "utilities")
  const defaultMatch = categoryId.match(/^default-(?:exp|inc)-(.+)$/);
  if (defaultMatch) {
    const words = defaultMatch[1].split(/-+/).filter((w) => w.length > 0);
    if (words.length > 0) {
      const matched = await prisma.category.findFirst({
        where: {
          accountId,
          type: kind,
          isDeleted: false,
          AND: words.map((word) => ({ name: { contains: word, mode: 'insensitive' as const } })),
        },
      });
      if (matched) return matched.id;
    }
  }

  // Auto-create category if it looks like a real name (not a default ID).
  if (!categoryId.startsWith('default-')) {
    const created = await prisma.category.create({
      data: { accountId, name: categoryId, type: kind },
    });
    return created.id;
  }

  return null;
}

/**
 * Resolve a category reference for a PATCH. Three outcomes, deliberately
 * distinct, because a Prisma update reads them differently:
 *
 *  - `string`    → set the category to this id
 *  - `null`      → the caller explicitly cleared it (sent null or an empty string)
 *  - `undefined` → could not be resolved; LEAVE THE STORED VALUE ALONE
 *
 * The third case is the reason this function exists. `resolveExpenseCategoryId`
 * answers `null` both for "cleared" and for "I could not resolve this", and the
 * update paths passed that straight into `data.categoryId`, so an id the server
 * did not recognise silently ERASED a category the row already had. On one
 * production account that wiped the category off 31 imported expenses
 * (7 182,13 zł, >60% of the month) while the phone kept displaying them
 * categorised — the server's budgets, analytics, reports and AI answers all
 * disagreed with the app as a result (ABA-566).
 *
 * Refusing to touch the field is the safe direction: a categorisation that
 * fails to arrive can be retried, one that is erased cannot be recovered.
 */
export async function resolveCategoryIdForUpdate(
  prisma: PrismaService,
  categoryId: string | undefined | null,
  accountId: string,
  kind: CategoryKind = 'expense',
): Promise<string | null | undefined> {
  if (categoryId === undefined) return undefined;
  if (!categoryId) return null;

  const resolved = await resolveExpenseCategoryId(prisma, categoryId, accountId, kind);
  return resolved ?? undefined;
}
