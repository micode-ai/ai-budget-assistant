import { proposedKey } from './proposedCategory';

export interface SeedableSplit {
  /** `null` when the server proposed this category and it does not exist yet. */
  categoryId: string | null;
  categoryName: string;
  itemIndexes: number[];
}

export interface SeedResult {
  /** Receipt-line index → local category id, or a `new:` sentinel. */
  itemCategories: Record<number, string>;
  /** True when a real split could not be matched and the set was discarded. */
  dropped: boolean;
}

/**
 * Turns the server's splits into the screen's line→category state.
 *
 * A real split that does not resolve to a local category discards the WHOLE
 * set: a partially resolved split no longer sums to the expense amount, which
 * is the one thing the split arithmetic must guarantee. A proposal is different
 * — it has no local category by definition, so it is held under a sentinel
 * until save. `resolveLocalId` is expected to try the id first and then the
 * name, so a proposal whose name the account has acquired since the scan
 * resolves to that real category and no duplicate is ever created.
 */
export function seedItemCategories(
  splits: SeedableSplit[] | undefined,
  resolveLocalId: (split: SeedableSplit) => string | undefined,
): SeedResult {
  const itemCategories: Record<number, string> = {};
  if (!splits || splits.length === 0) return { itemCategories, dropped: false };

  for (const split of splits) {
    const localId = resolveLocalId(split);
    if (!localId && split.categoryId !== null) {
      return { itemCategories: {}, dropped: true };
    }
    const key = localId ?? proposedKey(split.categoryName);
    for (const index of split.itemIndexes) {
      itemCategories[index] = key;
    }
  }

  return { itemCategories, dropped: false };
}
