# Home screen (phone): widgets and quick actions

*Hub: [mobile-app](../mobile-app.md) · desktop counterpart: [desktop-dashboard](desktop-dashboard.md)
· related: [financial-health-score](financial-health-score.md)*

## What this is

The home tab on the phone and on narrow web: an orange hero header, a configurable quick-action
strip, and an ordered list of widgets the user can reorder and hide. The user's choices are device
preferences in MMKV, not server state.

## Entry points

- `apps/mobile/app/(tabs)/index.tsx` — a one-line route rendering `DashboardView`
- `apps/mobile/src/components/home/DashboardView.tsx` / `DashboardView.web.tsx` — the width split
  (`DashboardMobile` vs `desktop/DashboardDesktop`)
- `apps/mobile/src/components/home/DashboardMobile.tsx` — the phone composition
- `apps/mobile/src/hooks/useHomeScreenData.ts` — every store subscription, derived totals, the
  account-change and focus-effect loading, `onRefresh`
- `apps/mobile/src/components/home/` — `HomeHeroHeader`, `HomeQuickActionStrip`, `SafeToSpendSheet`,
  `HomeWidgetSwitch` (`renderHomeWidget(key, ctx)`), `HomeWidgetContext.ts`, and one file per card in
  `widgets/`; other widgets live in `apps/mobile/src/components/widgets/`
- `apps/mobile/src/stores/widgetVisibilityStore.ts` (`WIDGET_KEYS`, MMKV `widget-visibility`, order
  key `widget-order`), `apps/mobile/src/stores/quickActionStore.ts` (`QUICK_ACTION_KEYS`,
  `DEFAULT_VISIBILITY`, MMKV `quick-actions`, order key `quick-action-order`, visibility keys
  prefixed `vis:`), both built on `apps/mobile/src/stores/orderedVisibilityStore.ts`
- `apps/mobile/src/components/ReorderableToggleList.tsx` — the generic drag-reorder + toggle list
- Settings: `apps/mobile/app/settings/widgets.tsx` →
  `apps/mobile/src/components/settings/widgets/WidgetsSettings.tsx`
- Tests: `apps/mobile/src/stores/__tests__/quickActionStore.test.ts`,
  `orderedVisibilityStore.test.ts`

## Key concepts

**Widgets render from the stored order.** `DashboardMobile` maps `widgetOrder` (de-duplicated at
the render site) through `renderHomeWidget(key, ctx)`, after the investment card, which sits above
the ordered list and is not part of the order system. On narrow web the same list is split into two
alternating columns.

**Two visibility stores, one factory.** Unknown persisted keys are dropped on load. A key missing
from the persisted order — a newly shipped one — is inserted at its intended position for widgets
(`insertMissingByPosition: true`, so a high-priority widget surfaces at the top for existing users)
and appended for quick actions. `reorder()` itself still appends any missing key, since a live drag
can only omit a key the user just removed. Visibility defaults are per key: the income-capture
actions (`voice_income`, `scan_invoice`) ship hidden. The pure `resolveVisibility` / `resolveOrder`
helpers are what the tests exercise, without mocking MMKV.

**The quick-action strip.** `HomeQuickActionStrip` renders the visible keys in order; route and
label maps are module-scoped there. `shopping_hub` has no route of its own — it opens a bottom-sheet
menu with "Shopping list" and "Purchase request", replacing two near-identical cart actions. When
nothing is visible, both the strip and the hero's bottom padding collapse (`showQuickActions =
canEdit && visibleQuickActions.length > 0`), so there is no empty bar; viewers never see the strip.

**The settings screen** has two sections — quick actions and widgets — each a
`ReorderableToggleList` with its own reset button. Hidden rows are greyed out but still
reorderable, and the scroll view is disabled while either list is dragging.

## Invariants

**A new widget gets its own file under `components/home/widgets/` (or `components/widgets/`), a
`WidgetKey`, a case in `renderHomeWidget`, and a label in the settings screen** — never inline JSX in
`HomeWidgetSwitch.tsx` and never a case back in the route. The switch regrew once to hundreds of
lines as each card was written inline. The same rule holds for quick actions in
`HomeQuickActionStrip.tsx`. ([inflation-shield](inflation-shield.md) lists the three places a new
`WidgetKey` must appear.)

**Do not revert the widget list to sequential `if` blocks.** Order is user data; only the map over
`widgetOrder` honours it.

**`ReorderableToggleList`'s `order` prop must be referentially stable** — read straight from the
store, never a fresh `.slice()` or literal per render — or the during-render sync with its local
drag order loops.

**A third reorderable-visibility surface calls `createOrderedVisibilityStore`**, rather than copying
either store.

## Known gaps

- `DashboardMobile` still carries a two-column branch gated on `useIsDesktopWeb()`. It is
  unreachable: `DashboardView.web.tsx` sends every desktop width to `DashboardDesktop`.

## History

ABA-189 (widget order) · ABA-207 (configurable quick actions, `ReorderableToggleList`, the
two-section settings screen) · ABA-304 (the home screen split out of a 1,145-line route) · ABA-332
(`shopping_hub`) · ABA-456 (the shared factory) · the `home-widget-switch-regrowth` tech-debt (cards
moved into `widgets/`).
