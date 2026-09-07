import i18n from '@/i18n';

/**
 * Turn a category/project/tag *entity* into its display label — never a raw id.
 *
 * Prompted by a production screenshot: the Analytics tab showed
 * `4c6595d1-a2a5-4c7a-8573-6931474f4194` under "Główna kategoria" instead of a
 * name. Nine call sites across the app had the same shape — `cat?.name ||
 * catId` / `project?.name || projectId` / `tag?.name || tagId` — because a
 * lookup that fails (a category deleted since, a locally-created row the
 * server never learned about — `Category` has no `clientId` in this schema —
 * or a stale cache) is a normal, expected state, and every one of those sites
 * degraded to the key it looked up with instead of a human label.
 *
 * The fix is the function signature, not the call sites: each of the three
 * functions below takes the **entity**, and there is no `id` parameter for a
 * caller to pass, and no `id` in scope inside the function body to fall back
 * to. A function that can never receive an id cannot return one — this makes
 * the whole class of bug unrepresentable here, rather than merely patched at
 * the nine places it happened to surface. Any new lookup-and-display call site
 * should render through one of these, not re-invent `x?.name || xId`.
 *
 * Localized via `i18n.t` imported directly, matching
 * `src/features/voice/useVoiceInput.ts` — these run from Zustand stores and
 * plain hooks, not just components, so there is no `useTranslation()` to reach
 * for.
 */

function resolveLabel(name: string | null | undefined, fallbackKey: string): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : i18n.t(fallbackKey);
}

export function categoryLabel(
  category: { name?: string | null } | null | undefined,
): string {
  return resolveLabel(category?.name, 'common.uncategorized');
}

export function projectLabel(
  project: { name?: string | null } | null | undefined,
): string {
  return resolveLabel(project?.name, 'common.unknownProject');
}

export function tagLabel(
  tag: { name?: string | null } | null | undefined,
): string {
  return resolveLabel(tag?.name, 'common.unknownTag');
}
