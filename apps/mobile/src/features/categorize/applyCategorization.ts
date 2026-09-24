import type { CategorizeCandidateExpense } from '@budget/shared-types';
import type { ApplyPlan } from './categorizeReview';

export interface ApplyDeps {
  createCategory(name: string): Promise<{ id: string }>;
  bulkSetCategory(ids: string[], categoryId: string): Promise<void>;
  localExpenses: { id: string; serverId?: string }[];
  /** Category ids that existed before apply — lets `created` exclude a draft that resolved to one. */
  existingCategoryIds?: Set<string>;
}

/**
 * The suggestions carry SERVER ids; the store addresses rows by its local id.
 * Match serverId, then id, then the creating device's clientId. A row the
 * client does not hold (web pages its list) keeps the server id — the bulk
 * endpoint resolves id-or-clientId itself.
 */
export function resolveLocalExpenseId(
  ref: { id: string; clientId: string | null },
  local: { id: string; serverId?: string }[],
): string {
  const hit =
    local.find((e) => e.serverId === ref.id) ??
    local.find((e) => e.id === ref.id) ??
    (ref.clientId ? local.find((e) => e.id === ref.clientId) : undefined);
  return hit?.id ?? ref.id;
}

/** Creates the reviewed new categories FIRST, then assigns every group. */
export async function applyCategorization(
  plan: ApplyPlan,
  refs: CategorizeCandidateExpense[],
  deps: ApplyDeps,
): Promise<{ categorized: number; created: number }> {
  const byId = new Map(refs.map((r) => [r.id, r]));
  const draftToCategory = new Map<string, string>();
  let created = 0;
  for (const draft of plan.newCategories) {
    const category = await deps.createCategory(draft.name);
    draftToCategory.set(draft.draftKey, category.id);
    if (!deps.existingCategoryIds?.has(category.id)) created++;
  }

  let categorized = 0;
  for (const a of plan.assignments) {
    const categoryId = a.target.kind === 'existing' ? a.target.categoryId : draftToCategory.get(a.target.draftKey);
    if (!categoryId) continue;
    const ids = a.expenseIds.map((id) => resolveLocalExpenseId(byId.get(id) ?? { id, clientId: null }, deps.localExpenses));
    await deps.bulkSetCategory(ids, categoryId);
    categorized += ids.length;
  }
  return { categorized, created };
}
