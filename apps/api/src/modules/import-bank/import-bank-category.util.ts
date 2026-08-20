import { PrismaService } from '../../database/prisma.service';

/**
 * Cache key for a resolved category. Includes the type: the same name can
 * legitimately exist as both an expense and an income category, and the unique
 * constraint is on `(account_id, name, type)`.
 */
export function categoryCacheKey(name: string, type: 'expense' | 'income'): string {
  return `${type}:${name.trim().toLowerCase()}`;
}

export async function resolveCategoryId(
  tx: any,
  accountId: string,
  suggestedName: string | undefined,
  cache: Map<string, string | null>,
  kind: 'expense' | 'income' = 'expense',
): Promise<string | null> {
  if (!suggestedName) return null;
  const key = categoryCacheKey(suggestedName, kind);
  if (cache.has(key)) return cache.get(key)!;
  // Anything not pre-resolved is a name preloadCategories did not see. Match
  // case-insensitively, as every other category resolver in this codebase
  // does, but do NOT create here: a P2002 inside this transaction would abort
  // the whole import.
  const cat = await tx.category.findFirst({
    where: { accountId, type: kind, name: { equals: suggestedName, mode: 'insensitive' } },
    select: { id: true },
  });
  const id = cat?.id ?? null;
  cache.set(key, id);
  return id;
}

/**
 * Resolves every distinct category name the batch references into an id,
 * creating the ones this account does not have yet.
 *
 * A statement from a bank carries no categories, so this does nothing for
 * those imports. It exists for exports from other budgeting apps, which do
 * carry the user's own taxonomy — and migrating a history is only worth doing
 * if it arrives organised, so a name with no local counterpart becomes a real
 * category rather than being dropped.
 *
 * Runs before the transaction and swallows a concurrent-create P2002 by
 * re-reading, the pattern this codebase settled on after a unique-constraint
 * violation inside a transaction took down a whole import (ABA-313).
 */
export async function preloadCategories(
  prisma: PrismaService,
  accountId: string,
  rows: Array<{ kind: string; suggestedCategoryName?: string }>,
  cache: Map<string, string | null>,
): Promise<void> {
  const wanted = new Map<string, { name: string; type: 'expense' | 'income' }>();
  for (const row of rows) {
    const name = row.suggestedCategoryName?.trim();
    if (!name) continue;
    if (row.kind !== 'expense' && row.kind !== 'income') continue;
    const type = row.kind as 'expense' | 'income';
    wanted.set(categoryCacheKey(name, type), { name, type });
  }
  if (wanted.size === 0) return;

  for (const [key, { name, type }] of wanted) {
    const existing = await prisma.category.findFirst({
      where: { accountId, type, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      cache.set(key, existing.id);
      continue;
    }
    try {
      const created = await prisma.category.create({
        data: { accountId, name, type },
        select: { id: true },
      });
      cache.set(key, created.id);
    } catch {
      // Lost a race, or the name collides under a casing this query missed —
      // re-read rather than fail the import over a category.
      const raced = await prisma.category.findFirst({
        where: { accountId, type, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });
      cache.set(key, raced?.id ?? null);
    }
  }
}
