import { useCategoryStore } from '@/stores/categoryStore';
import { categoryLabel } from '@/utils/entityLabel';

/**
 * Label for a category that arrived as an id + name pair inside some other
 * payload (a server report, a merchant rule, a Wrapped card).
 *
 * The name in such a payload is the server's STORED name, which for a standard
 * category is whatever language it was created in. When this device holds the
 * category, its local row goes through the display rule (`categoryLabel`) and
 * follows the UI language like everywhere else; otherwise the stored name is
 * shown as before.
 *
 * Reads the store with `getState()` - callers are render paths that already
 * re-render on their own data, and the category list is loaded app-wide long
 * before any of these screens.
 */
export function storedCategoryLabel(
  categoryId: string | null | undefined,
  storedName: string | null | undefined,
): string {
  const local = categoryId ? useCategoryStore.getState().getCategoryById(categoryId) : undefined;
  return categoryLabel(local ?? { name: storedName });
}
