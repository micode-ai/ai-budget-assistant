# Settings desktop shell

*Hub: [mobile-app](../mobile-app.md)*

## What this is

On web at ≥1024px, settings becomes a two-pane layout: a 280px left nav and the selected screen as
the right pane, both inside one page scroll. Native and narrow web are untouched.

## Entry points

- `apps/mobile/src/features/settings/settingsRegistry.ts` — **the single source of truth**
- `apps/mobile/src/components/settings/SettingsRoute.{tsx,web.tsx}` — where the decision is made
- `apps/mobile/src/components/settings/` — one extracted component per settings screen
- `apps/mobile/src/components/SheetDialog.tsx` + `sheetDialog.geometry.ts`
- `apps/mobile/src/components/webLayout.constants.ts` — `SETTINGS_NAV_WIDTH`

## Key concepts

**The registry decides what a row is.** Each entry is either a `pane` (`width: 'form'` = a 720px
left-aligned cap, or `'full'` for a list) or a `link` that navigates out of the shell. The rule:
*if it changes how the app behaves for you it is a pane; if it is a place you work it is a link.*
Four destinations stay links permanently — wallet, shopping list, purchase requests, subscriptions —
because settings is their only entry point and they can never be dropped.

**`SettingsRoute.web.tsx` is a real no-op split, not a re-export.** Below 1024 it early-returns the
same frame as the native file, so Metro's native graph never reaches the shell, the registry or the
left pane.

**All seventeen route files stay, and there is deliberately no `app/settings/_layout.tsx`.** The
selection IS the URL, so a bookmark and a reload work with no routing change — and route-level
`.web.tsx` resolution is unverified in this repo.

**A pane's child is a route, not a dialog.** Both shapes — the detail of a list, and a form that
creates something — are reached with `router.push`, render full-page under `WebShell`, and return by
the stack header's back arrow, which restores the pane because the selection is the URL.

## Invariants

**Check the screen's root before swapping it into a pane.** The reflex from five identical
extractions is wrong about a third of the time: one root was a `KeyboardAwareScreen`, one a
`SafeAreaView edges={['bottom']}`, one a bare `ScrollView`, one a `FlatList`.

**A pane stays mounted across an account switch** — a defect class that does not exist on a
stack-based phone screen. Screens that loaded once in a mount effect showed the previous account's
data; the fix is one `useAccountStore.subscribe` clearing caches, not an edit in each of the eight
places that write `currentAccountId`.

**The test for dialog-vs-route is "is this a leaf?", not "detail or form?"** A dialog must host a
screen *in full*, and a screen whose only edit and delete affordances live in `<Stack.Screen>`'s
`headerRight` cannot be hosted by one.

**Do not add a child route to `SETTINGS_ENTRIES`.** Their absence from the registry is exactly what
keeps their `headerShown: true`, and that back arrow is the return path the whole model depends on.

**A create form must not be dialog-hosted here.** `account/create`'s trip card ends in
`router.dismissAll()`, and an RN `Modal` is not a route — so it survives a `POP_TO_TOP` and would be
left floating over the tabs with a fresh screen pushed underneath.

**A hosted dialog must HOST the existing component**, driven through a ref handle, never a second
implementation — that is what stops the desktop layer drifting from mobile about what an edit does.

**Nothing under `src/` may import from `app/`.** `@/*` maps only to `./src/*`. Extracting a screen
into `src/` also removes a phantom expo-router route, since everything under `app/` is a route
unless excluded.

**`SETTINGS_ENTRIES` is drawn in array order.** Keep the array in left-pane order, so a row rises
into the pane block in place the day it is extracted.

**A bottom-anchored `Modal` must add `insets.bottom`.** The app is edge-to-edge, so a fixed
`paddingBottom` puts the last row under the system nav bar — on a three-button device it is not just
clipped but untappable. `SheetDialog` owns that inset for the sheets it wraps.

## Known gaps

- A pane's child routes are **uncapped**: they stretch to the full viewport while the pane they came
  from stops at 720. The fix is shell-level, not one per screen.
- `import` never becomes a pane — it is a five-file wizard whose preview and column mapper are
  full-width workspaces.
- Nothing renders a component in CI, so layout, focus traps and contrast across all accents and both
  themes are verified by hand.

## History

ABA-508 (wave 1) · ABA-510 (wave 2) · ABA-511 (wave 3) · ABA-512 (wave 4 — the three rows that live
outside `app/settings/`, which is where the pane-child question had to be answered) · ABA-483 (the
nav-bar inset, copy-pasted into eight sheets before anyone hit it).
