import type { Category } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { catalogKeyForName } from './category-catalog';

/** trim, collapse inner whitespace, lower-case, NFC. */
export function normalizeCategoryName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

type Kind = 'expense' | 'income';
type Row = { id: string; name: string; systemKey?: string | null };

/**
 * Core matcher. Rows are assumed already scoped to the right account, type and
 * liveness by the caller. Order: the row carrying the candidate's key, then a
 * keyless row whose name maps to that key, then a row with an equal name.
 * This is the CREATE rule (key first). A path resolving a reference to an
 * existing category uses `matchExistingCategory` (exact name first) instead.
 */
export function matchKeyedCategory<T extends Row>(candidateName: string, type: Kind, existing: readonly T[]): T | null {
  const norm = normalizeCategoryName(candidateName);
  if (!norm) return null;
  const key = catalogKeyForName(candidateName, type);
  if (key !== null) {
    for (const c of existing) if (c.systemKey === key) return c;
    for (const c of existing) if (!c.systemKey && catalogKeyForName(c.name, type) === key) return c;
  }
  for (const c of existing) if (normalizeCategoryName(c.name) === norm) return c;
  return null;
}

/**
 * Matcher for RESOLVING a reference to a category the account already has (an
 * expense's name fallback, an import row's category name). An exact
 * normalized name wins over the key rule; only when no row carries that name
 * does the key rule run.
 *
 * Why not key-first here: the backfill keyed only the oldest of several rows
 * that mean one concept and left the rest keyless (e.g. keyed "Zakupy
 * spożywcze" beside keyless "Groceries"). A reference that has always landed
 * on the keyless "Groceries" by name would, key-first, now land on the keyed
 * row - moving spend between categories, which key work must never do.
 * CREATING stays key-first (`matchKeyedCategory`, `createOrReuseKeyed`): there
 * nothing is moved, and reusing the keyed row is what prevents a duplicate.
 */
export function matchExistingCategory<T extends Row>(candidateName: string, type: Kind, existing: readonly T[]): T | null {
  const norm = normalizeCategoryName(candidateName);
  if (!norm) return null;
  for (const c of existing) if (normalizeCategoryName(c.name) === norm) return c;
  return matchKeyedCategory(candidateName, type, existing);
}

export function findKeyedCategory<T extends Row & { type: string }>(
  candidateName: string,
  type: Kind,
  existing: readonly T[],
): T | null {
  return matchKeyedCategory(
    candidateName,
    type,
    existing.filter((c) => c.type === type),
  );
}

/**
 * Returns the account's live category that means `data.name`, or creates one
 * carrying the catalog key (null for a name outside the catalog). A P2002 on
 * the key / name unique means a concurrent request won: re-read and return it.
 */
export async function createOrReuseKeyed(
  prisma: PrismaService,
  data: {
    accountId: string;
    userId?: string;
    name: string;
    type: Kind;
    icon?: string;
    color?: string;
    parentId?: string | null;
    clientId?: string;
  },
): Promise<Category> {
  const readLive = async () => {
    const live = await prisma.category.findMany({
      where: { accountId: data.accountId, type: data.type, isDeleted: false },
    });
    return matchKeyedCategory(data.name, data.type, live);
  };

  const found = await readLive();
  if (found) return found;

  try {
    return await prisma.category.create({
      data: {
        accountId: data.accountId,
        userId: data.userId,
        name: data.name,
        icon: data.icon,
        color: data.color,
        type: data.type,
        parentId: data.parentId,
        clientId: data.clientId ?? undefined,
        systemKey: catalogKeyForName(data.name, data.type),
      },
    });
  } catch (e: any) {
    if (e?.code !== 'P2002') throw e;
    const winner = await readLive();
    if (winner) return winner;
    // Only a soft-deleted row can still hold the name index now (live rows
    // were re-read above). Revive it, as CategoriesService.reuseExisting does,
    // rather than hand back a row the account no longer sees.
    const byName = await prisma.category.findFirst({
      where: { accountId: data.accountId, type: data.type, name: data.name },
    });
    if (!byName) throw e;
    if (!byName.isDeleted) return byName;
    return prisma.category.update({ where: { id: byName.id }, data: { isDeleted: false } });
  }
}
