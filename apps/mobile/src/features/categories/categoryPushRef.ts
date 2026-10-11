const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CategoryPushRef {
  categoryId?: string;
  categoryName?: string;
}

/**
 * How a transaction's category is addressed when it is pushed to the server.
 *
 * The id goes first, the name only beside it as a fallback. The id is either
 * the server's PK (adopted on pull) or this device's own id, which the server
 * also knows as the category's `clientId` — both resolve, and an id cannot be
 * confused with another category the way a name can: an account can hold one
 * name twice, and a name-only push once filed incomes under a deleted expense
 * category of the same name (ABA-666). The name still travels so a category
 * that has not reached the server yet resolves anyway.
 *
 * A seeded `default-*` id is not a UUID and means nothing to the server, so
 * that row keeps being sent by name, exactly as before.
 */
export function categoryPushRef(
  categoryId: string | null | undefined,
  category: { name?: string | null } | null | undefined,
): CategoryPushRef {
  if (!categoryId) return {};
  const name = category?.name || undefined;
  if (!name) return { categoryId };
  if (!UUID_RE.test(categoryId)) return { categoryId: name };
  return { categoryId, categoryName: name };
}
