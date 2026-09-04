/**
 * Native no-op. The web version subscribes to navigation; this one must not,
 * because a route subscription anywhere near `RootNavigator` re-renders its 95
 * `<Stack.Screen>` elements on every navigation (see `useFirstRunOnboarding`'s
 * note on why `usePathname()` was removed from there).
 */
export function useTelemetryScreenViews(_gateOpen: boolean): void {}
