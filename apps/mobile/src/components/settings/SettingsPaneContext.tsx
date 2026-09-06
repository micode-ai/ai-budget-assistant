import React, { createContext, useContext, useMemo } from 'react';

/**
 * What a settings screen needs to know about where it is being rendered.
 *
 * A settings screen is rendered in one of two places: full-page inside its own
 * route (native, and web below `DESKTOP_MIN_WIDTH`), or as the right pane of
 * `SettingsShell` (desktop web). The two differ in exactly two ways, and both
 * of them are here so that no screen has to reach for `Platform`, a width, or
 * a safe-area hook of its own:
 *
 * - **`bottomInset`** — the route wrapper owns `SafeAreaView` and the system
 *   inset; a pane sits inside a page that has already accounted for it. The
 *   spec calls this "the single most likely source of a regression in this
 *   work", so it is passed down rather than re-derived per screen. A screen
 *   composes it exactly as it composes `insets.bottom` today.
 * - **`desktop`** — the sanctioned `desktop?: boolean` flag from the design
 *   language (§5a): the mobile call site passes nothing and therefore keeps
 *   its layout by construction, not by discipline.
 *
 * The default is the mobile answer, so a screen rendered outside any provider
 * behaves exactly as it does today.
 */
export interface SettingsPaneContextValue {
  /** `true` only when this screen is the right pane of the desktop shell. */
  desktop: boolean;
  /** System bottom inset a screen must add to its own scroll padding. */
  bottomInset: number;
}

const DEFAULT: SettingsPaneContextValue = { desktop: false, bottomInset: 0 };

const SettingsPaneContext = createContext<SettingsPaneContextValue>(DEFAULT);

export function SettingsPaneProvider({
  desktop,
  bottomInset,
  children,
}: SettingsPaneContextValue & { children: React.ReactNode }) {
  const value = useMemo(() => ({ desktop, bottomInset }), [desktop, bottomInset]);
  return <SettingsPaneContext.Provider value={value}>{children}</SettingsPaneContext.Provider>;
}

export function useSettingsPane(): SettingsPaneContextValue {
  return useContext(SettingsPaneContext);
}
