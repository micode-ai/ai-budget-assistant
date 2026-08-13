/**
 * Groups a receipt's line items into category splits.
 *
 * The hard invariant: each returned amount is exact to the cent (correctly
 * rounded 2dp), and the group cent-values sum to the total's cent-value
 * exactly by integer construction. Note: re-summing the returned floats with
 * the `+` operator carries the usual IEEE-754 epsilon, so a consumer that needs
 * to compare a sum against the total must compare in cents (round to 2dp), not
 * via raw float equality.
 *
 * Why this matters: `analytics.service.ts` groups by splits *instead of* the
 * expense's own category but computes the period total from `expense.amount`,
 * so a split set that does not round to the amount silently stops the
 * breakdown adding up to the total and makes every percentage wrong. Each
 * individual amount being exact is what downstream code (Decimal columns,
 * DTOs, mobile mirror, formatters) actually needs.
 *
 * Pure: no I/O, no clock, no Prisma. Mirrored for the mobile client in
 * `packages/shared-utils/src/formatting/receipt-category-split.ts` — change one,
 * change the other. It cannot be a single shared import: the API has no build
 * step for workspace packages.
 */

export interface SplitInputItem {
  /** Position of the line on the receipt; carried through for explainability. */
  index: number;
  /** The line's total price, in the receipt's currency. */
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
}

export interface ReceiptCategorySplit {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}

export interface ReceiptSplitConfig {
  /** Max |Σitems − total| as a percentage of total before we refuse to split. */
  tolerancePct: number;
}

export const RECEIPT_SPLIT_DEFAULTS: ReceiptSplitConfig = { tolerancePct: 5 };

const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => Math.round(cents) / 100;
const isUsableAmount = (amount: number): boolean => Number.isFinite(amount) && amount > 0;

export function buildCategorySplits(params: {
  items: SplitInputItem[];
  total: number;
  config?: ReceiptSplitConfig;
}): ReceiptCategorySplit[] {
  const { items, total } = params;
  const config = params.config ?? RECEIPT_SPLIT_DEFAULTS;

  if (!Number.isFinite(total) || total <= 0) return [];

  const usable = items.filter((i) => isUsableAmount(i.amount));
  if (usable.length === 0) return [];

  const totalCents = toCents(total);

  // Every line counts toward the tolerance check, assigned or not: an
  // unassigned line's money is still part of this receipt.
  const itemsCents = usable.reduce((sum, i) => sum + toCents(i.amount), 0);
  const gapPct = (Math.abs(itemsCents - totalCents) / totalCents) * 100;
  if (gapPct > config.tolerancePct) return [];

  const groups = new Map<string, { categoryName: string; cents: number; itemIndexes: number[] }>();
  for (const line of usable) {
    if (!line.categoryId) continue;
    const group = groups.get(line.categoryId) ?? {
      categoryName: line.categoryName ?? '',
      cents: 0,
      itemIndexes: [],
    };
    group.cents += toCents(line.amount);
    group.itemIndexes.push(line.index);
    groups.set(line.categoryId, group);
  }

  if (groups.size < 2) return [];

  const ordered = Array.from(groups.entries())
    .map(([categoryId, group]) => ({ categoryId, ...group }))
    // Ties broken by categoryId so the output is deterministic for a given input.
    .sort((a, b) => b.cents - a.cents || a.categoryId.localeCompare(b.categoryId));

  // The residual is whatever the assigned lines did not account for: unassigned
  // lines, a folded discount, or rounding. It goes to the largest group.
  const assignedCents = ordered.reduce((sum, g) => sum + g.cents, 0);
  const residual = totalCents - assignedCents;
  ordered[0].cents += residual;

  // A residual big enough to zero out the largest group means the arithmetic no
  // longer describes the receipt. Refusing beats publishing a nonsense split.
  if (ordered[0].cents <= 0) return [];

  // Re-sort: absorbing the residual can change which group is largest.
  ordered.sort((a, b) => b.cents - a.cents || a.categoryId.localeCompare(b.categoryId));

  const splits = ordered.map((group) => ({
    categoryId: group.categoryId,
    categoryName: group.categoryName,
    amount: fromCents(group.cents),
    percentage: Math.round((group.cents / totalCents) * 10000) / 100,
    itemIndexes: group.itemIndexes,
  }));

  // Percentages are rounded to 2dp individually, so make the largest absorb the
  // rounding drift and keep the set summing to exactly 100.
  const percentageDrift = 100 - splits.reduce((sum, s) => sum + s.percentage, 0);
  splits[0].percentage = Math.round((splits[0].percentage + percentageDrift) * 100) / 100;

  return splits;
}

export interface ExistingSplitShare {
  categoryId: string;
  amount: number;
}

export interface RescaledSplit {
  categoryId: string;
  amount: number;
  percentage: number;
}

/**
 * Redistributes an existing split across a new total, keeping each category's
 * proportion and the exact-sum invariant.
 *
 * This is what a split whose categories were NOT derived from line items needs
 * when the expense amount changes — a hand-made split has no item categories to
 * rebuild from, so proportional redistribution is the only honest answer, and
 * deleting it instead would silently discard the user's own work.
 *
 * Deliberately NOT expressible through buildCategorySplits: that function
 * reconciles lines against a total and refuses when they disagree by more than
 * the tolerance, which is exactly what an amount edit makes them do.
 */
export function rescaleSplits(splits: ExistingSplitShare[], total: number): RescaledSplit[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  if (splits.length === 0) return [];

  const totalCents = toCents(total);
  const shares = splits
    .map((split) => ({ categoryId: split.categoryId, cents: toCents(split.amount) }))
    .filter((share) => Number.isFinite(share.cents));

  const previousCents = shares.reduce((sum, share) => sum + share.cents, 0);
  // Nothing to scale by: every share is zero, so no ratio exists.
  if (previousCents <= 0) return [];

  // Largest first, ties broken by categoryId, so the output is deterministic
  // for a given input — same convention as buildCategorySplits.
  const ordered = shares.sort((a, b) => b.cents - a.cents || a.categoryId.localeCompare(b.categoryId));

  const scaled = ordered.map((share, index) => ({
    categoryId: share.categoryId,
    cents: index === 0 ? 0 : Math.round((share.cents * totalCents) / previousCents),
  }));
  const allButLargest = scaled.slice(1).reduce((sum, share) => sum + share.cents, 0);
  scaled[0].cents = totalCents - allButLargest;

  // A residual big enough to zero out the largest share means the rescale no
  // longer describes a split. Refusing beats publishing a nonsense one.
  if (scaled[0].cents <= 0) return [];

  const result = scaled.map((share) => ({
    categoryId: share.categoryId,
    amount: fromCents(share.cents),
    percentage: Math.round((share.cents / totalCents) * 10000) / 100,
  }));

  const percentageDrift = 100 - result.reduce((sum, share) => sum + share.percentage, 0);
  result[0].percentage = Math.round((result[0].percentage + percentageDrift) * 100) / 100;

  return result;
}
