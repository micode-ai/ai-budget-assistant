/** One category group of a receipt's line-item split (null id = a proposed, not-yet-created category). */
export interface OverallCategoryGroup {
  categoryId: string | null;
  categoryName: string;
  amount: number;
}

/**
 * Decides a scanned receipt's overall category from three sources, in order of
 * trust: a learned merchant rule (the user taught it), then the line-item split
 * (per-product evidence), then the OCR model's single guess.
 *
 * The model's guess is not trusted on its own because the scan prompt's "null
 * if none fits" is routinely ignored: on a renovation account with no groceries
 * category, a Biedronka receipt of bread, pears and sour cream came back as
 * "Zakupy budowlane" at confidence 0.99 — presumably matching on the word
 * "Zakupy". So the split, when there is one, gets a veto:
 * - the largest group is a PROPOSED category → no overall category; the
 *   proposal's name is surfaced as the suggestion instead;
 * - the model's pick is not one of the split's groups at all → use the
 *   largest existing group instead.
 */
export function reconcileReceiptCategory(input: {
  ruleCategoryId: string | null | undefined;
  model: { categoryId: string | null | undefined; name: string | null | undefined };
  groups: OverallCategoryGroup[];
}): { categoryId: string | null; categorySuggestion: string | null } {
  const modelPick = { categoryId: input.model.categoryId ?? null, categorySuggestion: input.model.name ?? null };
  if (input.ruleCategoryId) return { categoryId: input.ruleCategoryId, categorySuggestion: modelPick.categorySuggestion };
  if (input.groups.length === 0) return modelPick;

  const largest = input.groups.reduce((a, b) => (b.amount > a.amount ? b : a));
  if (largest.categoryId === null) return { categoryId: null, categorySuggestion: largest.categoryName };

  const agrees = input.groups.some((g) => g.categoryId !== null && g.categoryId === modelPick.categoryId);
  if (agrees) return modelPick;
  return { categoryId: largest.categoryId, categorySuggestion: largest.categoryName };
}
