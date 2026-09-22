# Desktop dashboard

*Hub: [mobile-app](../mobile-app.md) · reference screen: [desktop-transactions-screen](desktop-transactions-screen.md)*

## What this is

The home tab at ≥1024px: a focus column beside a ~300px rail, the first-run state for a brand-new
web user, and the quick links that replaced the phone's quick-action strip.

## Entry points

- `apps/mobile/src/components/dashboard/DashboardView.{tsx,web.tsx}` — the only file that decides
- `DashboardMobile.tsx` — the phone's JSX, in exactly one definition
- `DashboardDesktop.tsx`, `FocusColumn.tsx`, `DashboardRail.tsx`, `RailQuickLinks.tsx`
- `apps/mobile/src/features/dashboard/` — `railQuickLinks.ts`, `attentionItems.ts`,
  `monthlyBudgetSegments.ts`, `dataReadiness.ts`, `attentionActions.ts`
- `apps/mobile/src/features/onboarding/resolveWebFirstRun.ts`

## Key concepts

**A rail, not a second wide column.** ~300px is close to the width every widget was already built
for on a phone, which is exactly why two equal ~880px columns made them all look sparse. A second
rail appears at 1680px and is filled **row-major, alternating left and right** — filling one rail to
the bottom first would bury the user's priority items 1–5 in one column and 6–10 in another.

**No widget was rewritten.** Shared widgets take optional props with mobile-preserving defaults, so
the phone keeps its layout by construction.

**Quick links read `quickActionStore` while the capture card above them is fixed.** Those four are
part of the layout's shape; the rest are "whichever shortcuts this user wants" — which is what
Settings → Widgets already means on the phone, so one settings screen governs both platforms with no
second list to sync.

**Everything decidable lives in a pure module** and is called, never paraphrased inline.

## Invariants

**Only the two write rows are `canEdit`-gated** among the quick links. A converter computes nothing
server-side, a subscription list is a read, shopping-list items are collaborative, and any member
including a viewer may vote on a purchase request — hiding those would deny what the API grants.
This is deliberately narrower than the phone strip's blanket gate.

**`shopping_hub` is ONE key and TWO rows.** Turning the single key off removes both; the
purchase-requests row additionally needs the shared account predicate, which has the same
`undefined`-is-not-shared trap the attention panel applies.

**A form finishes in a dialog; a place you work is a navigation.** Three forms became dialogs through
one route-to-dialog table shared with the first-run state, so the two can never disagree. The three
list screens stay navigations, pinned by a test.

**`useTransferForm` has no default `onSaved`.** Back navigates the *dashboard* away from a dialog,
and on a first page load with no history does nothing at all, leaving a submitted form open. A
default would let the next caller inherit that quietly.

**A hosted view's `Stack.Screen` stays on the ROUTE.** One rendered inside a dialog would configure
whichever route is underneath.

**Segments are shown only when the month reduces to a single contributing budget with category
allocations.** The monthly summary blends across all active monthly budgets and carries no
per-category data, so a bar invented across merged budgets would be a wrong number — worse than no
bar.

**Never draw unloaded data as fact.** With budgets landed and expenses still in flight, the health
score reported **"Great, 100"** about an account it knew nothing about, and totals read `+0,00` /
`-0,00`. Readiness is computed by a pure module; native short-circuits to fully-ready, because
SQLite holds the whole account offline and dashes there would hide correct figures. The initial
loader fires only when **nothing** has answered — covering already-correct figures with a spinner is
worse — and is bounded by its own timer armed **once on mount**, since re-arming per pull is the
opposite of a bound.

**An em dash, not a zero, for an unknown figure.** One shared `PendingValue` inherits the replaced
number's text style; five widgets each inventing a placeholder is how a screen ends up with a dash, a
zero and a spinner all meaning the same thing.

**The first-run decision is three-valued.** See [first-run-onboarding](first-run-onboarding.md).

## Traps worth not re-deriving

- **gifted-charts' `height` is not the drawn height** — it draws the below-axis region *beyond* it,
  scaled by the data, so one prop value renders between 1.25× and 2.0×.
- **The chart wrapper animates its width from a value whose effect never depends on the width**, and
  on web the first layout pass reports a narrower width than the settled one — so the wrapper locked
  narrow while the drawn path tracked the true width and clipped the newest month.
- **`getBudgetProgress` reads its stores via `.getState()`, not a subscription**, so a `useMemo` over
  it froze on partial state on the first screen after sign-in.
- **A `Pressable` scrim always emits a `tabIndex`**, so an invisible scrim becomes the focus trap's
  *first* target. Use a plain element.
- **The alert badge is a hardcoded red on an accent ground**, measured at WCAG 1.00–1.61 across all
  13 accents — the disc and the bar differ only in hue, so no colour token could have fixed it; a
  2px ring did. **The same defect is still live on the phone.**

## Known gaps

- `useSafeToSpend.hasEnoughData` is `data !== null` for every non-desktop reader, so the phone still
  reports a server zero as a fact. Suppressed at the desktop call site only, deliberately.
- The rightmost point of one chart is clipped by ~19% on mobile and always has been; fixing it
  changes the mobile rendering and needs a store release.
- `voice_income` and `scan_invoice` get no quick-link row until their screens are extracted.

## History

ABA-505 (the layout) · ABA-507 (first-run state, retention pass, top-bar tiering) · ABA-517 (quick
links) · ABA-518, ABA-521, ABA-523 (the readiness and figure-correctness fixes behind the
invariants above).
