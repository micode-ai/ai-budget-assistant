import type { CategorizeSuggestionsResponse } from '@budget/shared-types';

/**
 * One group from CategorizeSuggestionsResponse, reshaped for a sequential
 * chat confirmation flow (bot /categorize). Server-internal only — never
 * sent to a client, so it lives here rather than in packages/shared-types.
 */
export interface BotCategorizeStep {
  /** Set for an existing-category group; null for a proposed new category. */
  categoryId: string | null;
  /** Existing category's name, or the model's proposed new-category name. */
  name: string;
  isNew: boolean;
  /** Server PKs — same ids CategorizeSuggestionsResponse.groups carries. */
  expenseIds: string[];
}

/**
 * Reshapes the app's batched review into a flat, sequential list for a bot's
 * one-group-at-a-time Yes/Skip/Stop flow. Drops empty groups (defensive —
 * the service never emits one, but a step with zero expenses would apply to
 * nothing). Largest group first: the best "yes" impact goes first, so a user
 * who stops partway through still cleared the biggest piles.
 */
export function buildBotSteps(
  response: CategorizeSuggestionsResponse,
  categoryNamesById: Map<string, string>,
): BotCategorizeStep[] {
  return response.groups
    .filter((g) => g.expenseIds.length > 0)
    .map((g) => {
      if (g.categoryId) {
        return {
          categoryId: g.categoryId,
          name: categoryNamesById.get(g.categoryId) ?? g.categoryId,
          isNew: false,
          expenseIds: [...g.expenseIds],
        };
      }
      return {
        categoryId: null,
        name: g.proposedName ?? '',
        isNew: true,
        expenseIds: [...g.expenseIds],
      };
    })
    .sort((a, b) => b.expenseIds.length - a.expenseIds.length);
}
