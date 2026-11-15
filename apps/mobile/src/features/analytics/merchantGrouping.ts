/**
 * The Analytics tab's by-merchant breakdown — pure, store-free.
 *
 * Merchants are grouped case- and edge-space-insensitively (`trim()` +
 * `toLowerCase()`), the same key `MerchantCategoryRule` uses, so "Lidl",
 * "LIDL" and "lidl " are one slice. The slice is labelled with the spelling
 * the user's rows use MOST (first seen wins a tie), not with whatever row
 * happened to come first. Merging is display-only: no row is rewritten — the
 * merchant tools on the merchants screen still own renaming.
 */

export interface MerchantRow {
  merchant?: string | null;
  amount: number;
  currencyCode: string;
}

export interface MerchantGroup {
  /** Display name: the most common spelling in the group. */
  merchant: string;
  amount: number;
  /** Number of expenses in the group. */
  visits: number;
  /** amount / visits. */
  averageTicket: number;
}

export function merchantKey(name: string): string {
  return name.trim().toLowerCase();
}

/** All merchant groups, largest amount first. Rows with no merchant are skipped. */
export function groupMerchants(
  rows: MerchantRow[],
  convert: (row: MerchantRow) => number,
): MerchantGroup[] {
  const groups = new Map<string, { amount: number; visits: number; spellings: Map<string, number> }>();
  for (const row of rows) {
    const raw = row.merchant?.trim();
    if (!raw) continue;
    const key = merchantKey(raw);
    const g = groups.get(key) ?? { amount: 0, visits: 0, spellings: new Map<string, number>() };
    g.amount += convert(row);
    g.visits += 1;
    g.spellings.set(raw, (g.spellings.get(raw) ?? 0) + 1);
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => {
      let best = '';
      let bestCount = 0;
      for (const [spelling, count] of g.spellings) {
        if (count > bestCount) {
          best = spelling;
          bestCount = count;
        }
      }
      return { merchant: best, amount: g.amount, visits: g.visits, averageTicket: g.amount / g.visits };
    })
    .sort((a, b) => b.amount - a.amount);
}
