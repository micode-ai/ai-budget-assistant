# Configurable Home Quick Actions — Design

**Date:** 2026-06-06
**Status:** Approved

## Problem

The home screen (`apps/mobile/app/(tabs)/index.tsx`) renders a horizontal
**quick-action strip** of 8 buttons as fully hardcoded JSX. Users cannot hide
actions they don't use. In particular, the two income-capture actions (voice
income, scan invoice) add clutter for users who only track expenses, yet they
are always visible.

The content widgets *below* the strip already support per-widget visibility +
drag-reorder via `widgetVisibilityStore` and a `settings/widgets.tsx` screen.
The quick-action strip should get the same treatment.

## Goals

1. Make each quick-action item's **visibility** user-configurable.
2. Allow **reordering** the strip (same UX as the widget list).
3. Ship sensible **defaults**: voice income and scan invoice **off** by default;
   all other actions on.

Non-goals: no server persistence (device-local, like widget visibility); no
new actions added; no change to what each action navigates to.

## Quick-action inventory

| key             | route               | existing label key            | default |
|-----------------|---------------------|-------------------------------|---------|
| `add_expense`   | `/expense/new`      | `dashboard.addExpense`        | on      |
| `scan_receipt`  | `/expense/receipt`  | `dashboard.scanReceipt`       | on      |
| `voice_expense` | `/expense/voice`    | `dashboard.voiceInput`        | on      |
| `voice_income`  | `/income/voice`     | `dashboard.voiceIncome`       | **off** |
| `scan_invoice`  | `/income/receipt`   | `dashboard.scanInvoice`       | **off** |
| `exchange`      | `/wallet/exchange`  | `dashboard.exchangeCurrency`  | on      |
| `converter`     | `/converter`        | `dashboard.currencyConverter` | on      |
| `transfers`     | `/wallet/transfer`  | `dashboard.transfers`         | on      |

## Design

### 1. New store: `src/stores/quickActionStore.ts`

Mirrors `widgetVisibilityStore` (MMKV-backed, `visibility` + `order`,
`toggle`/`setVisible`/`reorder`/`resetOrder`). Differences:

- MMKV id: `quick-actions`.
- `QUICK_ACTION_KEYS` = the 8 keys above (this constant defines the default order).
- **Per-key default visibility** via a `DEFAULT_VISIBILITY` map, because the
  widget store's `loadVisibility` always defaults unknown keys to `true`. Here:
  `voice_income` and `scan_invoice` default to `false`, the rest to `true`.
  Default is applied only when the MMKV key is absent (`val === undefined`), so
  a user who has explicitly enabled one keeps their choice across updates.
- `order` load/validation identical to the widget store (drop unknown keys,
  append missing keys, fall back to `QUICK_ACTION_KEYS` on parse error).

### 2. Home screen: data-driven strip

Replace the 8 hardcoded `<TouchableOpacity>` blocks with:

- A module-level descriptor array keyed by action: `{ key, route, labelKey }`.
- An icon-render map `renderQuickActionIcon(key, theme)` keyed by action key,
  since icons differ (some are `<Image>` with `tintColor`, some are
  `<Ionicons>`). Kept out of the descriptor to keep it serial-simple.
- Render: `order.filter((k) => visibility[k]).map(...)`.

The strip stays gated behind `canEdit` as today. If every action is hidden, the
strip wrapper collapses (render nothing) so there's no empty bar.

### 3. Reusable reorderable list component

The drag logic in `settings/widgets.tsx` (~130 lines of PanResponder + animated
translate + per-key responder cache) is extracted into
`src/components/ReorderableToggleList.tsx`:

**Props:**
```ts
interface ReorderableToggleListProps<K extends string> {
  keys: readonly K[];           // canonical key set (for responder cache + validation)
  order: K[];                   // current order from the store
  visibility: Record<K, boolean>;
  labels: Record<K, string>;
  onReorder: (next: K[]) => void;
  onToggle: (key: K, visible: boolean) => void;
}
```

It owns the local-order/drag state machine currently inside the screen. The
screen renders two instances (quick actions, then widgets), each wired to its
own store, plus the existing "reset order" buttons.

### 4. Settings screen layout

`settings/widgets.tsx` gains a **"Quick actions"** section above the existing
widgets section:

```
[hint]
Quick actions
  <ReorderableToggleList … quick-action store />
  [Reset order]
Widgets
  <ReorderableToggleList … widget store />
  [Reset order]
```

Each section gets a small header label. The screen keeps a single `ScrollView`;
`scrollEnabled` is disabled while *either* list is dragging. Mechanism:
`ReorderableToggleList` accepts an `onDraggingChange(dragging: boolean)` prop and
calls it on drag start/release/terminate. The screen holds two booleans (one per
list) and sets `scrollEnabled={!quickDragging && !widgetDragging}`.

### 5. i18n

New keys in all 9 locale files (`en, de, es, fr, pl, ru, ua, be, nl`):

- `settings.quickActionsTitle` — section header ("Quick actions").
- `settings.widgetsTitle` — section header for the existing widget list
  ("Widgets"), so both sections are labelled consistently.

Action labels reuse the existing `dashboard.*` keys — no new label keys.

## Files touched

- **new** `apps/mobile/src/stores/quickActionStore.ts`
- **new** `apps/mobile/src/components/ReorderableToggleList.tsx`
- `apps/mobile/app/(tabs)/index.tsx` — data-driven strip
- `apps/mobile/app/settings/widgets.tsx` — two sections, use new component
- `apps/mobile/src/i18n/locales/*.ts` — 9 files, 2 new keys each

## Risks

- Extracting `ReorderableToggleList` touches working widget-reorder logic.
  Mitigation: extract verbatim (same PanResponder math), wire the widget section
  through it first and verify reorder still works before adding the quick-action
  section.
- An all-hidden strip must not leave an empty bar — guard the wrapper.

## Testing

- Manual: toggle each quick action off/on → strip updates; reorder → persists
  across app restart; fresh install shows voice-income + scan-invoice hidden;
  reset order restores `QUICK_ACTION_KEYS` order.
- Widget reorder still works after the component extraction (regression check).
