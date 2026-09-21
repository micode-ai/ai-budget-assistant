/**
 * What the "without category" picker option is allowed to match.
 *
 * The filter used to match a falsy `categoryId` and nothing else, while the
 * expense detail screen renders `common.uncategorized` for BOTH a missing
 * category and a `categoryId` it cannot resolve to a known category. So a row
 * could read "Bez kategorii" on screen and be invisible to the filter named
 * after that exact label — which is how a diverged install (ABA-575) showed a
 * screen full of uncategorized expenses and an empty list behind the filter.
 *
 * The rule here is the agreement: if the UI calls a row uncategorized, the
 * uncategorized filter must find it.
 */

import { countsAsUncategorized } from '../categoryFilter';

const loaded = (known: string[]) => ({
  isInitialized: true,
  hasCategories: true,
  resolve: (id: string) => (known.includes(id) ? { id } : undefined),
});

describe('countsAsUncategorized', () => {
  it('counts a row with no category at all', () => {
    expect(countsAsUncategorized(null, loaded(['cat-1']))).toBe(true);
    expect(countsAsUncategorized(undefined, loaded(['cat-1']))).toBe(true);
    expect(countsAsUncategorized('', loaded(['cat-1']))).toBe(true);
  });

  it('does not count a row whose category resolves', () => {
    expect(countsAsUncategorized('cat-1', loaded(['cat-1']))).toBe(false);
  });

  it('counts a row whose category id resolves to nothing — what the screen already calls uncategorized', () => {
    expect(countsAsUncategorized('server-uuid', loaded(['cat-1']))).toBe(true);
  });

  // Both guards below answer the same question in the safe direction: an
  // unresolvable id is only evidence of divergence once we actually know what
  // the account's categories are. Before that, every row in the app would
  // qualify and the filter would claim a fully-categorized ledger has nothing
  // but uncategorized rows.
  it('does not count an unresolved id while the category store is still loading', () => {
    expect(
      countsAsUncategorized('cat-1', { isInitialized: false, hasCategories: false, resolve: () => undefined }),
    ).toBe(false);
  });

  it('does not count an unresolved id when the loaded category list is empty', () => {
    expect(
      countsAsUncategorized('cat-1', { isInitialized: true, hasCategories: false, resolve: () => undefined }),
    ).toBe(false);
  });
});
