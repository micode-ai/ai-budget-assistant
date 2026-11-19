/**
 * A per-account, in-memory cache of one online-only list (pets, vehicles) that
 * every mounted reader can subscribe to (ABA-833).
 *
 * Why it exists: the transactions tab stays mounted, and its bulk bar shows
 * "Assign to pet" only when the pet list is non-empty. A plain module-level Map
 * filled once on first mount kept an early empty answer forever, so a pet added
 * in Settings, on another device or after a failed load never surfaced until a
 * page reload. Here every write notifies all subscribers, an entry older than
 * `ttlMs` is revalidated by the next reader, and `clear()` runs on sign-out
 * (module-scope caches must be torn down with the stores, "Web data loading").
 *
 * Pure (no React, no API import), so the sign-out path can import it without
 * pulling the API client into a cycle, and it is unit-testable.
 */
export interface AccountListCache<T> {
  get(accountId: string): T[] | undefined;
  /** Missing, or loaded more than `ttlMs` ago. */
  isStale(accountId: string, now?: number): boolean;
  set(accountId: string, list: T[], now?: number): void;
  /** Applies `fn` to a cached list (a write the server confirmed); no-op when nothing is cached. */
  update(accountId: string, fn: (list: T[]) => T[]): void;
  delete(accountId: string): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export function createAccountListCache<T>(ttlMs = 30_000): AccountListCache<T> {
  const entries = new Map<string, { list: T[]; at: number }>();
  const listeners = new Set<() => void>();
  const notify = () => {
    // A copy: a listener may unsubscribe while being notified.
    for (const l of [...listeners]) l();
  };
  return {
    get: (accountId) => entries.get(accountId)?.list,
    isStale: (accountId, now = Date.now()) => {
      const e = entries.get(accountId);
      return !e || now - e.at > ttlMs;
    },
    set: (accountId, list, now = Date.now()) => {
      entries.set(accountId, { list, at: now });
      notify();
    },
    update: (accountId, fn) => {
      const e = entries.get(accountId);
      if (!e) return;
      entries.set(accountId, { list: fn(e.list), at: e.at });
      notify();
    },
    delete: (accountId) => {
      if (entries.delete(accountId)) notify();
    },
    clear: () => {
      if (entries.size === 0) return;
      entries.clear();
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
