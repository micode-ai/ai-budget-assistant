import { useCallback, useEffect, useMemo } from 'react';
import type { Child } from '@budget/shared-types';
import { useAccountStore } from '@/stores/accountStore';
import { useChildStore } from '@/stores/childStore';

interface Options {
  /**
   * Always (re)load when mounted or when the account changes. The settings
   * screen passes it: it is where a name typed on another device should show
   * up. Pickers on expense forms leave it off and load only while nothing has
   * loaded for this account yet — a detail screen opened fifty times a day must
   * not pull the children list fifty times.
   */
  refresh?: boolean;
}

/** Name order for every picker and list, locale-aware. */
export function sortChildren(children: Child[]): Child[] {
  return [...children].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The current account's children, loaded for it.
 *
 * Keyed on `currentAccountId`: `childStore.reset()` runs on every account
 * switch (`clearAccountScopedCaches`), which drops `isLoaded`, so a screen that
 * stays mounted across a switch loads the new account's list instead of
 * showing the old one.
 *
 * **A failed load and an empty load are different states here.** `loadFailed`
 * is true only when the store recorded an error AND never loaded this account;
 * an account with no children is `isLoaded && children.length === 0`. A screen
 * must show a retry for the first and the empty state for the second.
 */
export function useAccountChildren({ refresh = false }: Options = {}) {
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const children = useChildStore((s) => s.children);
  const isLoaded = useChildStore((s) => s.isLoaded);
  const isLoading = useChildStore((s) => s.isLoading);
  const error = useChildStore((s) => s.error);
  const loadChildren = useChildStore((s) => s.loadChildren);

  useEffect(() => {
    if (!currentAccountId) return;
    if (!refresh && useChildStore.getState().isLoaded) return;
    void loadChildren(currentAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccountId, refresh]);

  const reload = useCallback(() => {
    if (currentAccountId) void loadChildren(currentAccountId);
  }, [currentAccountId, loadChildren]);

  const sorted = useMemo(() => sortChildren(children), [children]);
  const activeChildren = useMemo(() => sorted.filter((c) => !c.archivedAt), [sorted]);
  const archivedChildren = useMemo(() => sorted.filter((c) => !!c.archivedAt), [sorted]);

  return {
    children: sorted,
    activeChildren,
    archivedChildren,
    isLoaded,
    isLoading,
    loadFailed: !!error && !isLoaded,
    reload,
  };
}
