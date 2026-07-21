import type { ThemeMode } from '@budget/shared-types';

export interface ThemePatch {
  themeMode?: ThemeMode;
  accentColor?: string | null;
}

export interface ThemePersistDeps {
  /** Whether a user session exists (drives whether we persist to the server). */
  isLoggedIn: boolean;
  /** Apply optimistically to local state (MMKV + authStore user). Always runs. */
  applyLocal: (patch: ThemePatch) => void;
  /** Persist server-side. May reject (offline). */
  persist: (patch: ThemePatch) => Promise<unknown>;
  /** Non-fatal persist failure handler. */
  onPersistError?: (error: unknown) => void;
}

/**
 * Mirrors applyCurrencyChange: optimistic local update first, then a
 * fire-and-forget server persist (only when logged in) whose failure is
 * non-fatal (works offline).
 */
export function applyThemePatch(patch: ThemePatch, deps: ThemePersistDeps): void {
  deps.applyLocal(patch);
  if (deps.isLoggedIn) {
    deps.persist(patch).catch((error) => deps.onPersistError?.(error));
  }
}
