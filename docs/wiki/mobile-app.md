# Mobile App (Expo / React Native)

## What this is

The primary product: one Expo 54 / React Native 0.81 codebase shipped as the Android app, the iOS
app, and the web app at `app.ai-budget.pl`. Offline-first on native — reads come from SQLite, a
server pull follows. On web there is no SQLite (see
[web-data-loading](features/web-data-loading.md)).

## Entry points

- `apps/mobile/app/_layout.tsx` — root layout; composes the bootstrap and deep-link hooks, mounts
  `WebShell`, `UpdatePrompt`, `UpgradeGate`
- `apps/mobile/app/(tabs)/` — the five tabs: `index` (home), `expenses`, `budgets`, `analytics`, `chat`
- `apps/mobile/src/stores/` — Zustand stores
- `apps/mobile/src/db/schema/index.ts` — SQLite schema (Drizzle); `src/db/*Repository.ts` — data access
- `apps/mobile/src/services/api.ts` — the composed `api` singleton
- `apps/mobile/src/i18n/locales/` — nine locales

## The directory is the list

Do not keep a count or an enumeration of stores, repositories, API files, hooks, components or
screens — here or in `CLAUDE.md`. Every such list in this repo went stale (the stores list missed
about twenty stores; "18 repositories" when there were 22; "14 api modules" when there were 25).
`ls` the directory. What is worth writing down is the **naming convention**, which is what tells you
what a file is:

| Directory | Convention |
|---|---|
| `src/stores/` | `*Store.ts` is a store. `*Actions.ts`, `*Sync.ts`, `*Progress.ts` are **function modules extracted from a composing store**, sharing its `set`/`get` — not stores themselves. `*.types.ts` holds a store's state type so extracted modules can import it without a cycle. `orderedVisibilityStore.ts` is a **factory**, not a store. `stores/index.ts` re-exports only a handful of stores; import from the file. |
| `src/db/` | `*Repository.ts`, raw `executeSql()` against the Drizzle schema. `client.native.ts` holds the `ALTER TABLE` migrations; `client.web.ts` is an in-memory mock. |
| `src/services/` | `<domain>.api.ts` — one file per API domain, composed into `api` by `api.ts`; base `HttpClient` in `http-client.ts` (JWT refresh, `X-Account-Id` injection, 401 → logout). `x.ts` / `x.native.ts` / `x.web.ts` triples are platform splits (`attribution`, `crypto`, `fileExport`, `fileImport`, `secureStorage`, `telemetry`). |
| `src/features/<area>/` | Pure, unit-tested logic and feature hooks, with no JSX. Screens own the JSX. |
| `src/components/<area>/` | Presentational components; `desktop/` subfolders are the web desktop layer. |
| `src/hooks/` | Cross-screen hooks, including the decomposed pieces of `app/_layout.tsx`. |
| `app/` | Expo Router routes. Nothing under `src/` may import from `app/` (`@/*` maps only to `./src/*`). |

## Key concepts

**Stores are compositions when they grow.** `walletStore`, `authStore`, `budgetStore` and
`expenseStore` were each split into function modules behind an unchanged public hook, so none of
their many importers changed. A new feature in one of those areas extends the relevant module, not
the store file. `authStore`'s state type lives in `authStore.types.ts` for the same reason. See
[budgets](features/budgets.md) for the budget split.

**Two visibility stores share one factory (ABA-456).** `quickActionStore` and
`widgetVisibilityStore` are thin calls to `createOrderedVisibilityStore<K>(keys, options)`. Their
one real difference — a key missing from the persisted order is **appended** (quick actions) or
**inserted at its intended position** (widgets, so a new high-priority widget surfaces for existing
users) — is the explicit `insertMissingByPosition` option. A third reorderable-visibility surface
should call the factory.

**Tabs fire a selection haptic** on every `tabPress` (`screenListeners` in `(tabs)/_layout.tsx`, `expo-haptics`, a no-op on web).

**The root layout is a composition of hooks (ABA-354).** `useAppBootstrap`, `useColdStartGate`,
`useAuthenticatedBootstrap`, `useBankNotificationCapture`, `useNotificationDeepLink`,
`useTripInviteDeepLink`, `useGenericDeepLink`. A new cross-cutting concern gets its own hook, not
another `useEffect` in `_layout.tsx`.

**MMKV for small persisted preferences** (`react-native-mmkv`, one store id per concern, e.g.
`ai-cost-confirmation`, `quick-actions`, `review-prompt`), `secureStorage` for tokens and anything
sensitive. Not AsyncStorage.

**Offline-first** is described in [offline-first-sync](features/offline-first-sync.md); ids in
[client-id-resolution](features/client-id-resolution.md).

## Invariants

**Header actions are `textInverse` (ABA-450).** Every stack header is painted `primary` with
`headerTintColor: textInverse`; a `primary` action on it is orange-on-orange (1.0:1) and a `danger`
one is 1.04:1 — invisible, not merely low-contrast. Nine such actions shipped, one of them a
destructive "Clear checked" with no confirmation. Do not colour a header action with a semantic
token; the confirmation dialog carries the meaning. And because `headerTitleAlign: 'center'` is
global, a long `headerRight` **label** silently truncates the title — prefer an icon, and put a
long labelled action in the screen body.

**The tab header puts the page title BELOW the divider**, on its own row, under the controls row
(account + currency pills, then alerts and settings). The comment in `app/(tabs)/_layout.tsx` above
`header:` says "title on its own top row" and is stale — the JSX in `TabHeader` is the truth.

**Account and display currency are separate pills** in the tab headers and the home hero
(`<AccountSwitcher showCurrency={false} />` + `CurrencyPill`); other consumers keep the combined pill.
Currency is a user preference, not account-scoped, so it is available to viewers; it always routes
through `authStore.setCurrency`.

**`InteractiveLineChart`'s wrapper stays auto-height with `overflow: hidden`, never a fixed height
(ABA-352).** gifted-charts draws the below-axis region *beyond* its `height` prop, so a fixed-height
clip hides every negative value.

**`QuickActionIcon`'s baked `#E37F2B` is a placeholder** substituted with the resolved accent at
render time, so the strip follows the user's accent colour. Do not "fix" the hardcoded literal.

**`UpdatePrompt` never dismisses a required update locally.** A soft dismissal persists the skipped
version under `skippedUpdateVersion`; a required update relies on the version check re-running when
the app becomes active.

**`useOrientationLock` locks portrait below 600dp** and unlocks on tablets and foldables; the app
config is `"orientation": "default"` because Android 16 ignores a manifest lock on large screens.

**`useAppVersionCheck` never blocks boot** — fail-silent, 6 h in-memory cache, no-op on web.

**Nine locales, all updated together.** `en.ts` is the source; a missing key renders the key string,
because i18next falls back to the key, not to English.

## Known gaps

- The stale comment above `header:` in `app/(tabs)/_layout.tsx`.

## Where to look first

A screen bug: `app/<screen>/`, then the component it composes. A data bug: the store, then its
repository — and on web, [web-data-loading](features/web-data-loading.md) first.
