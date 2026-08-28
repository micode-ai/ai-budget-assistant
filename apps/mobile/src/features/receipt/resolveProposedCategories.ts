import { isProposedKey, proposedKey, proposedName } from './proposedCategory';

/** The subset of a split this module needs: only how its category is addressed. */
export interface KeyedSplit {
  categoryId: string | null;
}

/**
 * Every proposed name that must exist as a real category before this receipt is
 * saved.
 *
 * Deliberately reads the SPLITS as well as the lines. The line map alone is not
 * enough: `seedItemCategories` writes a key only for the indexes in a split's
 * `itemIndexes`, and the deposit group's is empty by construction — it is the
 * one group with no receipt line behind it. Collecting names from the lines only
 * therefore skipped the deposit's proposal entirely, and the save path then sent
 * the raw `new:<name>` sentinel to the API, where `resolveExpenseCategoryId`
 * auto-created a category literally named `new:Kaucja` and every later scan
 * matched it by name and reused it. See `proposedCategory.ts`: a sentinel must
 * never reach the API or SQLite.
 *
 * Order is the lines' first, then the splits', so the output is deterministic
 * for a given input.
 */
export function proposedNamesForSave(
  itemCategories: Record<number, string | null | undefined>,
  splits: readonly KeyedSplit[],
): string[] {
  const names = new Set<string>();
  const collect = (key: string | null | undefined) => {
    if (isProposedKey(key)) names.add(proposedName(key as string));
  };
  Object.values(itemCategories).forEach(collect);
  splits.forEach((split) => collect(split.categoryId));
  return Array.from(names);
}

/**
 * Turns proposed names into real categories and hands back the key→id resolver
 * the save path uses for both the receipt lines and the split groups.
 *
 * `create` is expected to be idempotent on (name, type) — `categoryStore`'s is —
 * so a name the account already acquired since the scan resolves to that
 * category rather than minting a duplicate. Categories are created here and
 * nowhere earlier: a scan the user abandons must leave the account exactly as it
 * found it.
 */
export async function resolveProposedCategories(
  names: readonly string[],
  create: (name: string) => Promise<{ id: string }>,
): Promise<(key: string | null | undefined) => string | undefined> {
  const realIdByKey = new Map<string, string>();
  for (const name of names) {
    const created = await create(name);
    realIdByKey.set(proposedKey(name), created.id);
  }
  return (key) => (key ? realIdByKey.get(key) ?? key : undefined);
}
