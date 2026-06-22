# Web Desktop Layout — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design phase)
**Scope:** Make the Expo-web SPA (`app.ai-budget.pl`) look like a real laptop/desktop web app instead of a stretched-full-width mobile screen — while leaving the native mobile (iOS/Android) UI and the narrow-web UI **byte-for-byte unchanged**.

## Problem

The web build is the mobile app rendered through `react-native-web`. On a laptop it stretches the single mobile column across the full viewport: content has no max-width, navigation is bottom tabs, and everything looks oversized and empty. The goal is a centered, framed desktop layout with a left sidebar.

## Goals

- Desktop (`width ≥ 1024`, web only): left sidebar navigation + a centered, max-width content column with a calm background around it.
- Mobile (native) and narrow web (`width < 1024`): **no change at all**.
- Minimum number of touch points; no per-screen rewrites.

## Non-Goals (YAGNI)

- No multi-column desktop reflow of Home / Analytics — they stay single-column, just centered and tidy.
- No new desktop-specific navigation for nested stack screens — the existing stack + back buttons keep working; the sidebar simply stays visible.
- No changes to theming, business logic, API, stores, or i18n copy (beyond any new nav labels that already exist).
- Redis/SQLite/offline flows untouched.

## Breakpoint & Gate

- `DESKTOP_MIN_WIDTH = 1024`.
- Desktop layout is active only when `Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH`.
- Width comes from `useWindowDimensions()` so a browser resize switches layouts reactively.
- Native iOS/Android can never satisfy the gate (`Platform.OS !== 'web'`), so the mobile code path is provably untouched.

## Desktop Layout (≥ 1024px)

```
┌─────────────────────────────────────────────────────┐
│ ░░ Sidebar ░░ │   ┌───────────────────────────┐  ░░░ │
│  [logo]       │   │  top bar (screen header)  │  ░░░ │
│  • Home       │   ├───────────────────────────┤  ░░░ │
│  • Transactions│  │                           │  ░░░ │
│  • Budgets    │   │   screen content          │  ░░░ │
│  • Analytics  │   │   (column ~760px)         │  ░░░ │
│  • AI chat    │   │                           │  ░░░ │
│  ───────────  │   │                           │  ░░░ │
│  • Alerts 🔔  │   └───────────────────────────┘  ░░░ │
│  • Settings   │                                       │
└─────────────────────────────────────────────────────┘
```

### Sidebar
- Fixed width ~240px, full height, background `theme.colors.primary` (matches current header).
- Top: app logo/brand.
- Primary items: Home, Transactions, Budgets, Analytics, AI chat (the 5 tab routes).
- Secondary items (below a divider): Alerts (`/alerts`), Settings (`/settings`).
- Active item highlighted by matching `usePathname()` against the route.
- Navigation via `router.push(<route>)`.
- Labels reuse existing i18n keys (`nav.dashboard`, `nav.expenses`, `nav.budgets`, `nav.analytics`, `nav.aiChat`, `alerts.title`, `nav.settings`).

### Top bar
- This is the **existing per-screen header** (orange `TabHeader` on tabs, hero header on Home, stack headers elsewhere). It already contains the account switcher, currency pill, alerts bell, and settings button — so nothing is lost and nothing is duplicated.
- On desktop we simply do **not** hide it.

### Bottom tabs
- Hidden on desktop: in `(tabs)/_layout.tsx`, when `web && width >= 1024`, set `tabBarStyle: { display: 'none' }` (extends the existing web-only branch that already adjusts tab bar height/padding).

### Content column
- Active screen content is constrained to `CONTENT_MAX_WIDTH = 760px`, centered (`alignSelf: 'center'`), with the surrounding area filled by `theme.colors.background` (optionally a very subtle gradient) so the page reads as a framed app, not a stretched sheet.
- The column wrapping is done centrally (see WebShell) — individual screens are **not** edited.

## Auth / unauthenticated screens
- The sidebar shows only when authenticated and the route is not under `(auth)`.
- On `(auth)` routes (or while logged out) WebShell still centers the content column (so the login/register form is a centered card) but renders **no sidebar**.

## Technical Implementation

### New: `src/components/WebShell.tsx`
- Wraps the root `<Stack>` inside `RootNavigator` (`app/_layout.tsx`) — a single insertion point.
- Behavior:
  - If not (`web && width >= 1024`): pure pass-through — renders `children` unchanged. **This is the mobile / narrow-web guarantee.**
  - Else (desktop): renders a horizontal layout = `<WebSidebar />` (when authenticated & not on auth route) + a flex column that contains the centered content wrapper around `children`.
- Reads auth state from `useAuthStore` and route from `usePathname()` to decide whether to show the sidebar.

### New: `src/components/WebSidebar.tsx`
- Presentational sidebar described above. Web-only (only ever mounted by WebShell on desktop).

### New: `src/hooks/useContentWidth.ts`
- Returns the width charts/measured components should size against:
  - Desktop (`web && width >= 1024`): `CONTENT_MAX_WIDTH` minus horizontal padding (the real column width).
  - Otherwise: `Dimensions.get('window').width` (current behavior — mobile unchanged).
- Single source of truth for `DESKTOP_MIN_WIDTH` and `CONTENT_MAX_WIDTH` constants (exported here or from a small shared module).

### Edit: `app/_layout.tsx`
- Wrap the returned `<Stack>` with `<WebShell>...</WebShell>`. No other change.

### Edit: `app/(tabs)/_layout.tsx`
- Add `width >= 1024` (web) condition to hide the bottom tab bar (`tabBarStyle.display = 'none'`). Uses `useWindowDimensions()`.

### Edit: 4 chart/measured components (replace `Dimensions.get('window').width` with `useContentWidth()`):
- `src/components/wallet/WalletMonthlyChart.tsx`
- `src/components/interactive-charts/InteractiveLineChart.tsx`
- `src/components/interactive-charts/InteractiveBarChart.tsx`
- `src/components/insights/InsightCarousel.tsx`

## How mobile stays untouched
- Every behavioral change is gated on `Platform.OS === 'web'` AND `width >= 1024`.
- `WebShell` is a pass-through on native and narrow web, so the render tree there is identical to today.
- `useContentWidth()` returns `Dimensions.get('window').width` on native/narrow web — the exact value the 4 components use now.

## Testing / Verification
- **Native unchanged:** confirm `WebShell` returns `children` directly when `Platform.OS !== 'web'`; charts use window width on native.
- **Narrow web (<1024):** layout matches current web (bottom tabs visible, full-width content).
- **Desktop (≥1024):** sidebar visible & highlights active route; bottom tabs hidden; content centered at ~760px; charts fit the column (no horizontal overflow); resizing the browser across 1024 toggles layouts without reload.
- **Auth route on desktop:** centered login card, no sidebar.
- Manual check via `npm run dev:web` at a few widths (390, 800, 1280, 1600).

## Risks / Open Items
- Some screens may have content that assumes very small width; in a 760px column they get more breathing room but should not break (flex layouts). Spot-check Home, Transactions, Budgets, Analytics, Chat, Settings, and a couple of detail screens.
- Modals (`presentation: 'modal'` stack screens) on web render within the shell; verify they still appear centered and usable.

## Out of scope follow-ups (not now)
- Multi-column desktop dashboards, desktop keyboard shortcuts, hover-rich interactions.
