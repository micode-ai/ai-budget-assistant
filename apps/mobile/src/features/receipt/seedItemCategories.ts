import type { ReceiptCategorySplit } from '@budget/shared-utils';
import { proposedKey } from './proposedCategory';

export interface SeedableSplit {
  /** `null` when the server proposed this category and it does not exist yet. */
  categoryId: string | null;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}

export interface SeedResult {
  /** Receipt-line index → local category id, or a `new:` sentinel. */
  itemCategories: Record<number, string>;
  /** True when a real split could not be matched and the set was discarded. */
  dropped: boolean;
  /**
   * The server's own split, ready to render: same amounts, with each category
   * addressed the way this screen addresses categories. Empty when the set was
   * dropped.
   *
   * This is what the screen shows until the user edits a line. Recomputing it
   * locally instead would mean two implementations of the same arithmetic have
   * to agree before anything appears at all — and when they disagree the screen
   * shows nothing, with no error, which is exactly how a stale web bundle once
   * hid a split the server had built correctly.
   */
  splits: ReceiptCategorySplit[];
}

const EMPTY: SeedResult = { itemCategories: {}, dropped: false, splits: [] };

/**
 * Turns the server's splits into the screen's line→category state, and into the
 * split it should display before any editing.
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
  if (!splits || splits.length === 0) return EMPTY;

  const itemCategories: Record<number, string> = {};
  const resolved: ReceiptCategorySplit[] = [];

  for (const split of splits) {
    const localId = resolveLocalId(split);
    if (!localId && split.categoryId !== null) {
      return { itemCategories: {}, dropped: true, splits: [] };
    }
    const key = localId ?? proposedKey(split.categoryName);
    for (const index of split.itemIndexes) {
      itemCategories[index] = key;
    }
    resolved.push({
      categoryId: key,
      categoryName: split.categoryName,
      amount: split.amount,
      percentage: split.percentage,
      itemIndexes: split.itemIndexes,
    });
  }

  return { itemCategories, dropped: false, splits: resolved };
}
