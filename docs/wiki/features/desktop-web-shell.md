# Desktop web shell

*Hub: [mobile-app](../mobile-app.md) · related: [web-build-and-hosting](web-build-and-hosting.md),
[desktop-transactions-screen](desktop-transactions-screen.md), [desktop-dashboard](desktop-dashboard.md)*

## What this is

The chrome the web build wraps around every screen at `width >= 1024`: a full-width top bar
carrying the brand, the five tab routes, the account control and the alerts/settings icons, over a
content area that fills the window. Native and narrow web (< 1024) are unchanged.

## Entry points

- `apps/mobile/src/components/webLayout.constants.ts` — `DESKTOP_MIN_WIDTH` (1024),
  `CONTENT_MAX_WIDTH` (1080), `TOP_BAR_HEIGHT` (56), `SIDEBAR_WIDTH`, `isDesktopWeb`,
  `useIsDesktopWeb`
- `apps/mobile/src/components/WebShell.tsx` (native no-op) · `WebShell.web.tsx` (`DesktopShell`)
- `apps/mobile/src/components/WebTopBar.tsx`, `WebSidebar.tsx`
- `apps/mobile/src/hooks/useContentWidth.ts`
- `apps/mobile/app/(tabs)/_layout.tsx` — hides the tab bar and per-screen header on desktop

## Key concepts

**One gate.** `isDesktopWeb(width)` is `Platform.OS === 'web' && width >= 1024`, so native never
qualifies. It is pure and unit-tested.

**`WebShell` wraps the root `<Stack>` once** in `app/_layout.tsx`. Overlays (`UpdatePrompt`,
`UpgradeGate`, `StatusBar`) stay outside it.

**No left sidebar.** The ABA-289 layout had one; the nav now lives in the top bar, where
`WebTopBar` renders `WebSidebar` with `orientation="horizontal"`, so the nav items and their
active-route matching (`usePathname()`) are still one component. `SIDEBAR_WIDTH` survives as a
width constant other layouts measure against.

**Content fills the area; charts cap.** The screen's own scrollbar sits at the window edge, with no
centred column and no dead gutters. Measured components size through `useContentWidth()` — capped to
`CONTENT_MAX_WIDTH` on desktop, raw window width otherwise, so mobile is unchanged. Current callers:
`WalletMonthlyChart`, `InteractiveBarChart`, `InsightCarousel`, and the dashboard's `AttentionPanel`
and `FirstRunPanel`.

**Unauthenticated routes get a centred 480px column** with no chrome.

## Invariants

**Native gets a real no-op, not a re-export.** `WebShell.web.tsx` statically imports `WebTopBar`
and `WebSidebar`; re-exporting it from the extensionless file would pull both into the native
bundle, where they can never render — verified once by grepping the Hermes bytecode. Metro resolves
the platform file, so the separation is enforced by the bundler, not a runtime branch. Same reasoning
as `services/telemetry.ts`.

**`DesktopShell` is a separate component, and its hooks run before its early return.** Route, auth
and theme hooks stay off the narrow path entirely, and inside `DesktopShell` every hook —
including `useDesktopShortcutsListener` — is called above the unauthenticated branch, so the hook
count cannot change when a browser resizes across 1024 or a user signs out while it stays mounted.

**Screen-level platform splits are component-level, never route-level** — see
[desktop-transactions-screen](desktop-transactions-screen.md).

**The top bar has no section title**, deliberately: the horizontal nav already marks the active
tab, `/settings` is named by its own left pane, and a third statement of the section would undo the
tiering that makes the account control the one labelled element. The settings gear shows an active
wash across all of `/settings` but no-ops only at its root, because from a pane it is still the way
back to the overview (see [settings-desktop-shell](settings-desktop-shell.md)).

## Known gaps

- Screens with no desktop design yet render their phone layout inside the content area, stretched.

## History

ABA-289 (the shell) · ABA-290 (full-width top bar) · the ABA-499 → ABA-514 desktop work, squashed
into PR #520: nav moved into the top bar and the left sidebar removed (which issue is not
recoverable from the squash), ABA-507 (top-bar tiering), ABA-512 (no section title).
