/**
 * A category the server proposed for a scanned receipt but that does not exist
 * yet. It arrives as `categoryId: null` and is held in local state under this
 * sentinel key so the untouched `buildCategorySplits` — which groups by an
 * opaque string id — can treat it as an ordinary group. The save path swaps
 * every sentinel for the id of a real, created category; a sentinel must never
 * reach the API or SQLite.
 */
export const PROPOSED_PREFIX = 'new:';

export const proposedKey = (name: string): string => `${PROPOSED_PREFIX}${name}`;

export const isProposedKey = (key: string | null | undefined): boolean =>
  typeof key === 'string' && key.startsWith(PROPOSED_PREFIX);

export const proposedName = (key: string): string => key.slice(PROPOSED_PREFIX.length);
