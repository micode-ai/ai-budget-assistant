import type { ReceiptCategorySplit } from '@budget/shared-utils';

export interface ManualSplitItem {
  index: number;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
}

const toCents = (amount: number): number => Math.round(amount * 100);

/**
 * Builds the split for lines the USER assigned by hand.
 *
 * Deliberately not `buildCategorySplits`. That function reconciles a machine's
 * reading of a receipt against its total and refuses when the two disagree by
 * more than a few percent — the right answer when a model is about to publish a
 * split nobody asked for. It is the wrong answer once a person has assigned the
 * lines themselves: their intent is not in doubt, and vetoing it means someone
 * categorises fifteen lines by hand and is shown nothing at all, which is what
 * a Lidl receipt whose OCR over-read the basket by 17.62 actually did.
 *
 * So there is no tolerance gate here. What survives is the part that protects
 * the data rather than second-guesses the user: the amounts are scaled to the
 * receipt total in proportion to what each category was assigned, and they sum
 * to it exactly. Proportional rather than residual-to-largest, because when the
 * line prices are known to be unreliable the only faithful reading of "these
 * lines are beer, those are food" is the ratio between them — dumping the whole
 * discrepancy on one category would invent a number the user never implied.
 */
export function buildManualSplits(items: ManualSplitItem[], total: number): ReceiptCategorySplit[] {
  if (!Number.isFinite(total) || total <= 0) return [];

  const groups = new Map<string, { categoryName: string; cents: number; itemIndexes: number[] }>();
  for (const line of items) {
    if (!line.categoryId) continue;
    if (!Number.isFinite(line.amount) || line.amount <= 0) continue;
    const group = groups.get(line.categoryId) ?? {
      categoryName: line.categoryName ?? '',
      cents: 0,
      itemIndexes: [],
    };
    group.cents += toCents(line.amount);
    group.itemIndexes.push(line.index);
    groups.set(line.categoryId, group);
  }

  // One category is not a split, the same rule the automatic path follows.
  if (groups.size < 2) return [];

  const ordered = Array.from(groups.entries())
    .map(([categoryId, group]) => ({ categoryId, ...group }))
    // Ties broken by categoryId so the output is deterministic for a given input.
    .sort((a, b) => b.cents - a.cents || a.categoryId.localeCompare(b.categoryId));

  const assignedCents = ordered.reduce((sum, group) => sum + group.cents, 0);
  if (assignedCents <= 0) return [];

  const totalCents = toCents(total);
  // The largest group is computed as the remainder rather than scaled, so the
  // set sums to the total exactly however the rest round.
  const scaled = ordered.map((group, index) => ({
    ...group,
    cents: index === 0 ? 0 : Math.round((group.cents * totalCents) / assignedCents),
  }));
  const allButLargest = scaled.slice(1).reduce((sum, group) => sum + group.cents, 0);
  scaled[0].cents = totalCents - allButLargest;
  if (scaled[0].cents <= 0) return [];

  const splits = scaled.map((group) => ({
    categoryId: group.categoryId,
    categoryName: group.categoryName,
    amount: group.cents / 100,
    percentage: Math.round((group.cents / totalCents) * 10000) / 100,
    itemIndexes: group.itemIndexes,
  }));

  const percentageDrift = 100 - splits.reduce((sum, split) => sum + split.percentage, 0);
  splits[0].percentage = Math.round((splits[0].percentage + percentageDrift) * 100) / 100;

  return splits;
}
