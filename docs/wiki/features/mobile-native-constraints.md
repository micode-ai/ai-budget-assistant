# Native build constraints of the mobile app

*Hub: [mobile-app](../mobile-app.md)*

## What this is

Rules about the native Android shell, the dev bundler and edge-to-edge layout that no single
feature owns, each learned from a crash, a hung build or an untappable button. Moved out of
`CLAUDE.md`, which keeps a one-line pointer per rule.

## Entry points

- `apps/mobile/android/app/src/main/java/com/budget/assistant/MainActivity.kt`
- `apps/mobile/src/hooks/useKeyboardHeight.ts`, `src/components/KeyboardAwareScreen.tsx`,
  `src/components/KeyboardAvoidingScreen.tsx`
- `apps/mobile/metro.config.js`

## Invariants

**MainActivity must call `super.onCreate(null)`.** (ABA-188): `apps/mobile/android/app/src/main/java/com/budget/assistant/MainActivity.kt` MUST pass `null` (NOT `savedInstanceState`) to `super.onCreate`. `react-native-screens` cannot restore its fragments — when Android restores the Activity after the OS kills the backgrounded process (common on Samsung deep-sleep), passing `savedInstanceState` throws `IllegalStateException: Screen fragments should never be restored` in native `MainActivity.onCreate`, **before any JS runs**, so the JS `ErrorBoundary` never catches it → app crashes on launch ("crashing frequently"). RN/Expo own screen state on the JS side. Do NOT let an `expo prebuild` regress this back to `savedInstanceState`. (Note: the mobile app has no crash-reporting SDK — `@sentry/react-native` is not a real dep. Since ABA-832 JS render and global errors are reported to `POST /telemetry/client-errors` and alerted to the ops channel — `docs/wiki/features/client-error-reporting.md` — but a native crash before any JS runs, like this one, is still only visible via Play Console Android vitals / `adb logcat`.)

**Keyboard handling.** **pure-JS, no native module** (builds with the local Windows Android toolchain — `react-native-keyboard-controller`'s Fabric codegen blows past the Windows 260-char MAX_PATH limit; do NOT reintroduce it or any keyboard native module). `src/hooks/useKeyboardHeight.ts` tracks height via RN `Keyboard` events (works under New Arch + Android edge-to-edge, where `KeyboardAvoidingView`/`adjustResize` are unreliable). Two wrappers in `src/components/`: `KeyboardAwareScreen` (drop-in for a form's root `ScrollView`: Android pads content by keyboard height, iOS `automaticallyAdjustKeyboardInsets`) and `KeyboardAvoidingScreen` (drop-in for `KeyboardAvoidingView` — pads bottom to lift docked inputs/footers; accepts+ignores `behavior`). Form screens import `KeyboardAvoidingScreen as KeyboardAvoidingView`.

**A bottom-anchored `Modal` must clear the system navigation bar (ABA-483).** the app is edge-to-edge, so the nav bar overlays the modal window — a sheet with `justifyContent: 'flex-end'` and a FIXED `paddingBottom` puts its last row underneath it, and on a three-button-nav device (~48dp) the row is not merely clipped but **untappable**. Every such sheet must add the inset: `useSafeAreaInsets()` and `paddingBottom: <base> + insets.bottom` as an inline override on the sheet view, with the base removed from the StyleSheet so there is one source for it (the pattern `AddDebtSheet`/`TransactionActionSheet`/`FinancialMonthSheet` already used). This was copy-pasted into **8** sheets before anyone hit it — `WhatsNewSpotlight` (the report: its two action buttons sat under the nav bar), `SafeToSpendSheet` (the prototype the others were copied from), `ChatHistorySheet`, `ItemCategorySheet`, `GroupQrModal`, `CreateCategoryModal`, `GoalAddFundsModal`, `UpgradeGate`. Sheets that take a `bottomInset` **prop** from their parent screen (`AddItemModal`, `ListNameModal`, `ListSwitcherModal`, `MergeProductsModal`, `RenameProductModal`) are already correct — don't add a second inset there. Note this cannot be caught by a test: there is no `react-test-renderer`/`@testing-library/react-native` in this repo, so nothing renders a component in CI and the only verification is on a device.

**Metro crawl scoping on Windows.** (ABA-255): Watchman has no Windows builds, so Metro falls back to its slower JS Node crawler. `apps/mobile/metro.config.js` keeps `watchFolders = [workspaceRoot]` (needed for hoisted deps + `packages/shared-*`) but extends `config.resolver.blockList` to exclude paths the mobile bundle never imports — `apps/api`, `apps/admin` (each with its own `node_modules`) and the `node_modules/@budget/(api|mobile)` + `node_modules/admin` workspace back-symlinks. `blockList` IS the file-map `ignorePattern` and the Node crawler applies it **at directory level** (skips the whole subtree before recursing), so this is what keeps the cold-start crawl from walking the entire ~150k-file monorepo and hanging the dev bundler before `index.bundle` can build. The default Expo `blockList` is preserved (combined into one RegExp with the default's flags to avoid Metro's `combine()` "different flags" error); `packages/shared-*` and `react-native` are NOT excluded (the app imports them); patterns use `[\\/]` so they match on Windows AND Linux/CI (web export). Do NOT widen `watchFolders` back to bare `workspaceRoot` without this blockList, and do NOT exclude `shared-types`/`shared-utils`.

## History

ABA-188 (MainActivity) · ABA-255 (Metro crawl) · ABA-483 (bottom sheets and the nav bar).
