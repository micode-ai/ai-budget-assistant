# Budgets — Desktop Web Design

This is the third screen. The first two — the transactions list (reference) and
Analytics — established `docs/contracts/desktop-web-design-language.md`.
Budgets has no rows either, like Analytics, but it isn't a read-only report:
every card on this screen is an entity someone made, can edit, and can delete.
That single fact is what makes this screen's decisions different from both of
its predecessors, and is argued throughout below rather than assumed.

**What's on the shipped mobile screen today, read from the code, not
guessed:** `app/(tabs)/budgets.tsx` is a `FlatList` of budget cards in
creation order (newest first — `addBudget` prepends), each showing name,
period, an over/on-track badge, spent-of-amount, a progress bar, remaining
(if any), and at most one of two mutually-reachable warning lines. A FAB opens
`/budget/new`. Tapping a card opens `/budget/[id]`, a second full screen with
a header card, per-budget period navigation, a progress card, an optional
per-category breakdown card, a details card, a 6-period history chart, and
Edit/Delete buttons that are **not** gated by `canEdit` today (a pre-existing
mobile gap, not introduced here — see the affordance table). Edit swaps the
whole screen for `BudgetEditForm`, a separate full-screen form component
already living in `src/components/budget/` — unlike `ExpenseDetailsCard`,
there is no single card that toggles between a view and an edit mode here.

## Goal

Let someone see, in the first second, which of their budgets are in trouble
right now, and open, adjust, or create any budget without leaving the page —
answered by grouping cards by state instead of the mobile list's plain
creation-order scroll, which was the actual defect in the as-built screen
(one full-bleed card, then dead space, then a FAB — reported directly from a
running build at 1920px).

### Whether any two blocks answer the same question

Two real cases, both about a single card's own content, not about separate
sections the way Analytics' redundancy was:

1. **A budget's projected overspend is stated twice, in two units, and the
   two conditions that trigger them are mathematically the same event.**
   `getBudgetProgress` sets `estimatedExhaustionDate` exactly when
   `dailyBurnRate > 0 && !isOverBudget && exhaustionDate <= periodEnd`, and
   the card separately shows a "projected total" warning exactly when
   `projectedTotal > item.amount && !isOverBudget`. Both `dailyAverage` and
   `dailyBurnRate` are the identical `spent / daysPassed` figure, and working
   through the algebra, `exhaustionDate <= periodEnd` reduces to
   `projectedTotal >= amount` up to the rounding both share (`Math.ceil` on
   the same day-counts). So on mobile, whenever the projected-total line
   shows, the exhaustion-date line is — up to that rounding — always showing
   too, immediately above it: the same "you're headed for trouble" fact,
   once as a future date, once as a future amount, stacked in two sentences.
   Invisible scrolled past one card at a time; visible the moment several
   cards sit in a grid and every at-risk one repeats the pair. **The amount
   leads** on desktop (see Layout) — it's in the same unit as the
   spent/total row already on the card, so it reads as an extension of a
   number already there rather than a fact needing its own sentence — and
   the date rides along in parenthesis on the same line rather than as a
   second one. Both figures are kept; only the doubled sentence is resolved.
2. **The summary-strip counts (below) are not a restatement of the grouped
   cards beneath them**, even though both describe "how many budgets need
   attention" — this is worth naming explicitly since it looks, at first
   glance, like exactly the kind of duplication decision 1 above resolves.
   It isn't: the tile is a number reachable without scrolling, the section
   is the underlying cards; this is the identical relationship the reference
   screen's own `SummaryStrip` has with the `TransactionTable` beneath it,
   and Analytics' summary strip has with its breakdown grid. A summary
   figure and the content it summarizes answering the same *question* at
   two *resolutions* is the norm on every desktop screen this app has
   shipped, not a defect to fix here.

## What each mobile affordance becomes

| Mobile today | Desktop | Why |
|---|---|---|
| `FlatList` of budget cards, plain creation order (newest first), no grouping | A 2–3 column card grid, grouped into **Needs attention** / **On track** sections (see Layout) | The reported defect: one full-width card, then empty space. A wide window can show which budgets need attention without scrolling; a flat creation-order list wastes that |
| Card — name + period label (e.g. "Monthly") | Name + period label **+ the budget's own current period's concrete date range** (e.g. "Monthly · 10 Aug – 9 Sep"), for every period type, not only monthly | New content, reusing existing math only: `[id].tsx` already computes this exact range per period type (`formatPeriodLabel`/`financialMonth`+`formatFinancialMonth` for monthly); a wide card has room to show it where the phone card didn't. Needs one small extraction — see Component moves |
| Card — over/on-track badge (2 states) | 3 states: **Over** (danger), **Nearing limit** (warning, new), **On track** (unchanged) | See "close to limit" in Layout — a budget trending toward trouble before it's literally over is a real, distinct, actionable state a phone's binary badge collapsed away |
| Card — spent / of amount | Unchanged | — |
| Card — progress bar + % | Unchanged for a plain/single-category budget. **Segmented by category** for a multi-category budget (`categoryAllocations.length > 1`), plus a compact colour-dot legend (names only, top 3 + "+N more", no numbers) | See "what a multi-category budget shows" in Layout — the exact case the task brief calls out. A single-allocation budget (`length === 1`) renders identically to the plain case; the model treats it as "multi-category" internally but there is nothing to segment |
| Card — "remaining" text (only if `remaining > 0`) | Unchanged, only when on track | — |
| Card — exhaustion-date warning **and** projected-total warning, two lines, effectively one signal (see redundancy above) | **One line**: "Exceeds by {amount}" when over, or "Projected to exceed by {amount} (~{date})" when at risk but not yet over | Resolves the redundancy — the amount leads, the date is folded in, nothing is dropped |
| Card — over-budget case shows no overage amount at all (only the red bar + badge; the spent/of-amount row implies it by subtraction) | Adds the explicit "Exceeds by {amount}" line | Genuinely new, not moved from anywhere — removes mental arithmetic across a grid of several cards, where the reference screen's own "what a wide window affords" reasoning applies directly |
| Card — no `isActive` indicator at all | Small muted "Inactive" tag; excluded from "Needs attention" grouping regardless of its numbers | `isActive` is real on the model but has no UI path to ever be set `false` today (checked — `new.tsx` always creates `true`, `BudgetEditForm` never exposes a toggle), so this is defensive rendering for a state the app cannot currently produce, not a new feature. See Open questions |
| FAB, bottom-right, `canEdit`-gated | "+ New Budget" button in a persistent screen-local control row (this screen's own top bar, below `WebTopBar`) | Direct application of the Universal rule against a FAB — the screen gets a top bar and the action goes in it, exactly as named in the task brief |
| Tap card → navigate `/budget/[id]` | Opens a centred `BudgetDialog` hosting the SAME `BudgetDetailView`/`BudgetEditForm` the mobile route hosts (see Component moves) | Universal dialogs rule |
| `/budget/[id]` — header card (name + badge) | Dialog header: title + badge, plus **Edit and Delete as header icon buttons**, both now `canEdit`-gated | See "Delete moves into the header" in Layout |
| `/budget/[id]` — Edit/Delete buttons at the bottom of the scrolled content, **not** `canEdit`-gated | Removed from the bottom of `BudgetDetailView`'s content; re-homed in the dialog header, gated | Two changes bundled here, both stated plainly: relocation (chrome), and closing a pre-existing mobile gap (viewers currently see buttons that would 403 server-side) — see Departures |
| `/budget/[id]` — period nav row (prev/next + label), hidden for `custom` | Unchanged, inside the hosted `BudgetDetailView` | No change in behaviour |
| `/budget/[id]` — progress card | Unchanged | — |
| `/budget/[id]` — category breakdown card, single vertical stack of rows | Unchanged for ≤4 categories. **Two columns** when more than 4 | Mirrors the reference/Analytics precedent exactly (`TopReceiptItems`/`TopItemsCard`: one column of 10 → two of 5) — the same "a phone scrolls a list, a wide dialog doesn't have to" reasoning, scoped to the one case (a budget with many categories) where it matters |
| `/budget/[id]` — details card (period, alert threshold, days remaining, projected total, active/inactive) | Unchanged | — |
| `/budget/[id]` — `BudgetHistorySection` (6-period grouped bar chart) | Unchanged — already renders at `width: '100%'`, no `useContentWidth()`/`Dimensions.get` dependency to fix (checked, unlike `SpendingTrendChart`'s bar chart on the Analytics screen) | — |
| `/budget/[id]` — Delete → `showAlert` confirm | Unchanged (already uses `showAlert`, not `Alert.alert` — checked, no fix needed here) | — |
| `/budget/new` — full-screen create form (name, currency, mode toggle, amount/category or `BudgetCategoryEditor`, period chips, alert-threshold chips, submit) | Opens a centred `BudgetCreateDialog` hosting the SAME form, extracted unchanged (see Component moves) | Universal dialogs rule, same shape as `CreateDialog` hosting `ExpenseCreateForm`/`IncomeCreateForm` |
| Pull-to-refresh (`RefreshControl`) | Dropped, no replacement | Matches the reference screen's own precedent — `ExpensesDesktop` drops `onRefresh`/`refreshing` from `useExpensesScreenData` entirely with no substitute control, and this screen follows the same already-shipped call rather than inventing a different answer for budgets alone |
| Loading spinner (only while `isLoading && budgets.length === 0`) | Same spinner, but gated on a **widened** loading signal — see States | `budgetStore.isLoading` today only spans the local-SQLite phase, which returns instantly (and empty) on desktop web with no SQLite mirror — the identical false-empty risk Analytics' spec found and fixed via `useHydrationStore.isHydrating`, except budgets has no equivalent flag yet. Flagged as a required store-level change, not just a screen one |
| Empty state — icon, title, subtitle, "Create Budget" button, full-bleed centered | Same content, in a **bounded-width** centered card (not full-bleed) with one added explanatory sentence | The task brief's own warning: a full-bleed centered block on a 1920px window reads as broken, not new — bounding the card's width is the fix, not adding invented content (a "starter template" chip row was considered and deliberately deferred — see Open questions) |
| — (new) | 4-tile summary strip: Total Budgets, Needs Attention, On Track, Categories Over Allocation | See Layout — none of these are shown anywhere on the mobile screen today |
| — (new) | Global period control | **Deliberately not added** — see Layout, "Why there is no period control" |

## Layout

### Why there is no period control

Each budget carries its own `period` (`daily`/`weekly`/`monthly`/`yearly`/
`custom`), and a monthly budget's "current period" additionally depends on
the account's own `monthAnchorDay` — there is no single shared clock across
a daily budget, a yearly one, and an anchored monthly one that a page-level
Week/Month/Year control (Analytics' own solution) could meaningfully drive.
The list screen today has no period control of any kind — every card always
shows its own current period via `getBudgetProgress(id)` with no
`referenceDate` override — and the only place period navigation exists is
per-budget, inside the detail screen's prev/next arrows, which this design
keeps exactly as-is inside the hosted `BudgetDetailView`. Adding one control
here would either be decorative (driving nothing, since every budget reads
its own current period regardless) or would have to silently reinterpret
what "period" means per card, which is worse. The considered answer is: no
page-level period control, full stop, and this list always shows "now" — the
same thing mobile already shows.

### Card grid and grouping

Two named groups: **Needs attention** and **On track**. A budget is "needs
attention" when it is active AND any of: already over budget, at or above
its own `alertThreshold` (falling back to 80% when unset — see Departures,
this is a deliberate divergence from mobile's hardcoded 80% color trigger),
or `projectedTotal > amount` (catches a budget trending toward trouble before
its current usage alone would flag it — a front-loaded month, for instance).
Everything else, including any inactive budget regardless of its numbers,
is "on track." Within each group, cards sort by `percentageUsed` descending
(worst-first), with inactive budgets always sorted last regardless of their
number.

**A group's header is shown only when BOTH groups have at least one member.**
If every budget currently needs attention, or none do, the screen renders one
flat grid with no header at all — a header distinguishing a group from
nothing is chrome with nothing to say, and the "0" is already visible on the
matching summary tile. This mirrors the reference screen's own "an empty
facet group renders nothing" instinct, applied to a state axis instead of a
category axis.

Cards themselves are a plain, uniform `flexWrap` grid — `flexBasis: '31%'`,
`flexGrow/Shrink: 1`, `minWidth: 300`. Unlike Analytics' breakdown grid, this
needs **no explicit width-band branch** (see "What changes at 1024–1439"
below) — there is no asymmetric double-width primary tile here, every card
is the same shape, so ordinary flex-wrap math reflows it continuously from 3
columns down to 2 as the window narrows, with no snap point to name.

### Summary strip

Four tiles, matching the reference/Analytics `SummaryStrip`/`SummaryTile`
idiom exactly (same card shape, same optional hover-pressable pattern):

- **Total Budgets** — count of all non-deleted budgets. Not clickable
  (nothing distinct to scroll to — everything is already on screen).
- **Needs Attention** — count from the grouping above. Clickable, scrolls to
  that section.
- **On Track** — count from the grouping above. Clickable, scrolls to that
  section.
- **Categories Over Allocation** — count of individual category allocations,
  across all active multi-category budgets, whose OWN `categoryBreakdown`
  entry is `isOverBudget`, independent of whether the parent budget's total
  is over. Not clickable — an over-allocated category can belong to a budget
  in either group, so there is no single scroll target. Always rendered,
  including "0" — a tile that appears only sometimes would make the strip
  visually unstable.

That last tile is the direct answer to "what a budget with per-category
allocations shows that it cannot on a phone": a multi-category budget can
read as comfortably on-track in total while one of its categories has
already blown through its own slice — invisible on mobile's list card (which
only shows the aggregate bar) and only visible today by opening the detail
screen for that one budget and reading its category breakdown. The tile
surfaces this fact for the whole account in one number, and the per-card
segmented bar (below) surfaces which specific budget it's in.

None of these four counts requires a new store method — every one is
derivable from `budgets` and `getBudgetProgress()`, exactly as
`getMonthlyBudgetSummary()` already derives its own aggregate from the same
two sources for the (separate, Home-screen-only, out of scope) monthly
widget. A small pure grouping/counting util is recommended for testability
— see Component moves.

**Deliberately no blended-total tile** ("total budgeted across all
budgets"). Unlike Analytics, where every figure shares one selected period
and only currency has to be reconciled, budgets of different periods (a
monthly $500 and a yearly $6000) cannot be summed at all without inventing a
meaning for the result — a category error, not an FX question the ledger's
per-currency rule already covers. Counting states avoids the trap entirely
and is the honest aggregate this screen can offer.

### What a multi-category budget shows here that it cannot on a phone

Beyond the summary tile above: a card whose budget has more than one
category allocation renders its progress bar **segmented** — one coloured
slice per category, in allocation order — instead of one flat fill, with a
compact legend beneath it: up to 3 colour-dot + name pairs, then "+N more"
(names only, no amounts — the exact numbers live in the dialog, not the
card). Hovering a segment shows a small tooltip with that category's name
and spent/allocated amounts. **Its focusable twin**: this tooltip is
supplementary, not the only path to the numbers — the whole card is already
a `Pressable` that opens `BudgetDialog`, where the same per-category numbers
are always shown as real rows, reachable identically by mouse or keyboard.
Nothing on this card is reachable ONLY by hover.

A budget with exactly one allocation (`categoryAllocations.length === 1`,
which `getBudgetProgress` still treats internally as "multi-category")
renders identically to a plain overall budget — there is nothing to
segment or list with one entry, and no legend or tooltip appears in that
case.

### Why Delete moves into the dialog header

On mobile, Edit and Delete sit at the very bottom of a scrolled stack of
cards — header, period nav, progress, optional category breakdown, details,
and up to a 6-period history chart — which on a wide dialog (all of that
content is hosted unchanged) can be a genuinely long scroll before reaching
either action. `ExpenseDialog` already established the pattern this screen
reuses: primary actions live as icon buttons in the dialog's own header, one
click away regardless of how much content sits below. Both Edit and Delete
move there, both gated by `canEdit` — closing the pre-existing mobile gap
where `[id].tsx` renders both buttons unconditionally (a viewer opening them
today would hit a 403 from the API's own `ViewerBlockGuard`, silently, since
`updateBudget`/`deleteBudget` only log the failure). Delete still opens the
same `showAlert` confirmation before doing anything.

### The dialogs

**`BudgetDialog`** — the desktop equivalent of navigating to `/budget/[id]`.
Owns an `isEditing` boolean (mirroring what the route file owns today) and
renders either the hosted `BudgetDetailView` (view mode; header carries
Edit/Delete/Close) or the hosted `BudgetEditForm` (edit mode; `BudgetEditForm`
already brings its own Cancel/Save footer and its own definite-height
`SafeAreaView → KeyboardAvoidingView → ScrollView(flex:1) + footer` layout,
so — like `CreateDialog` hosting `ExpenseCreateForm`/`IncomeCreateForm` — the
dialog gives it a definite `height`, not a shrink-to-fit `maxHeight`, and
adds no second footer of its own while editing). Closing while editing reuses
`ExpenseDialog`'s exact `requestClose` heuristic and its exact three i18n
keys (`expensesDesktop.discardChanges{Title,Message,Confirm}`) — neither
`BudgetEditForm` nor `ExpenseDetailsCard` reports a real dirty flag, so
"ask whenever the edit toggle is on" is the same honest signal in both
places; no new copy needed for this part.

**`BudgetCreateDialog`** — same shape as `CreateDialog`, hosting
`BudgetCreateForm` (extracted from `app/budget/new.tsx`, see Component
moves), definite height for the same structural reason. **Deliberately no
discard-confirmation on close**, for the identical reason `CreateDialog`
itself gives none: opening the dialog IS the act of starting a create, there
is no untouched "view" state to compare against, and neither form reports a
dirty flag to gate a confirmation on.

### Wireframe, ≥1440px

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ WebTopBar: AI Budget · Dashboard Expenses Budgets Analytics AI Chat  [acct][$][🔔][⚙] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                     [+ New Budget]     │  screen-local
├──────────────────────────────────────────────────────────────────────────────────────┤ ┐ control row
│ ┌───────────────┐ ┌────────────────┐ ┌───────────────┐ ┌────────────────────────┐    │ │ Summary
│ │ Total Budgets │ │ Needs Attention│ │ On Track      │ │ Categories over        │    │ │ strip
│ │      7        │ │ ⚠ 2            │ │ ✓ 5           │ │ allocation: 1          │    │ │ (1 row,
│ └───────────────┘ └────────────────┘ └───────────────┘ └────────────────────────┘    │ ┘ 4 tiles)
│                                                                                        │
│  Needs attention (2)                                                                  │ ┐
│ ┌───────────────────────┐ ┌───────────────────────┐                                  │ │ grid,
│ │ Groceries      [OVER] │ │ Entertainment [NEARING]│                                  │ │ 3 cols
│ │ Monthly · 10Aug–9Sep  │ │ Monthly · 10Aug–9Sep   │                                  │ │ (2 of 3
│ │ 620 / of 500 zł       │ │ 410 / of 500 zł        │                                  │ │ used here,
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 124%  │ │ ▓▓▓▓▓▓▓▓▓▓▓▓░░░ 82%    │                                  │ │ wraps at 3)
│ │ Exceeds by 120 zł     │ │ Projected to exceed by │                                  │ │
│ │                       │ │ 40 zł (~28 Aug)        │                                  │ │
│ └───────────────────────┘ └───────────────────────┘                                  │ ┘
│                                                                                        │
│  On track (5)                                                                         │ ┐
│ ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐        │ │ grid,
│ │ Overall spending      │ │ Transport             │ │ Vacation fund [INACT.]│        │ │ 3 cols
│ │ Monthly · 10Aug–9Sep  │ │ Yearly · 2026          │ │ Yearly · 2026         │        │ │
│ │ 2100 / of 3500 zł     │ │ 900 / of 2400 zł       │ │ 0 / of 5000 zł        │        │ │
│ │ ●●●  +1 more          │ │                        │ │                        │        │ │
│ │ ▓▓▓▓▓▓░░░░░░░ 60%     │ │ ▓▓▓▓▓░░░░░░░░ 37%      │ │ ░░░░░░░░░░░░░░ 0%      │        │ │
│ │ 1400 zł remaining     │ │ 1500 zł remaining      │ │                        │        │ │
│ └───────────────────────┘ └───────────────────────┘ └───────────────────────┘        │ ┘
└──────────────────────────────────────────────────────────────────────────────────────┘
              one page scroll, from the summary strip down through both groups
```

### What changes at 1024–1439

**Nothing structurally, and that is a considered answer, not an oversight.**
The summary strip is the same 4-tile shape Analytics already proved holds at
this width (`flexBasis: 23%`, `minWidth: 200` — 4 tiles plus gaps fit
comfortably inside 1024's content width). The card grid has no named branch
either — checked arithmetically: at a 1024px window, minus the page's own
padding, the remaining content width comfortably fits three 300px-minimum
cards with gaps to spare, so the grid still renders 3 columns near the top
of this band and continuously narrows toward 2 as the window shrinks toward
1024, purely from `flexBasis`/`minWidth` math, with no deliberate snap point
— unlike Analytics' breakdown grid, which genuinely needed one because its
primary tile was asymmetrically double-width. A uniform grid of
similarly-compact cards simply doesn't have that problem. This is, per the
language doc's own framing, still a prediction until a real deployed screen
at, say, 1100px confirms it looks right rather than merely computes right —
flagged under Open questions.

## States

**Loading.** Same spinner mobile already shows, gated the same way (`isLoading
&& budgets.length === 0`) — but `budgetStore.isLoading` needs widening first.
Today it flips back to `false` right after the local-SQLite read (phase 1 of
`loadBudgets()`), before the server pull (phase 2) even starts; on native
that's invisible because the SQLite read has real rows already. On desktop
web, `loadAllBudgets` reads an in-memory mock and returns `[]` instantly, so
`isLoading` goes true→false in a moment and the screen would show the empty
state — the exact false-empty flash Analytics' spec identified and fixed via
`useHydrationStore.isHydrating`. Budgets has no equivalent flag today; this
spec requires one (either widen `isLoading` to also cover phase 2, or add a
sibling flag) as a store-level change accompanying this screen, not merely a
screen-level one.

**Empty** (zero non-deleted budgets — the case the task brief specifically
warns a wide screen makes look worse). No summary strip (there is nothing to
count), no section headers, just one centered, **bounded-width** card (not
stretched full-bleed the way the reported bug rendered a single populated
card) with the existing icon, title, and subtitle, plus one added sentence
naming the value ("Budgets alert you before you overspend — start with one
category or an overall monthly limit") and the same "Create Budget" button,
opening `BudgetCreateDialog`. No preset/template chips — considered and
deliberately deferred, see Open questions.

**Populated.** As designed above.

**Error.** No dedicated error UI, matching mobile precedent and Analytics'
own stated reasoning for the same gap: `budgetStore.error` is tracked but
never rendered by any consumer today. This spec does not add one — a
persistently failing budget load would be indistinguishable from "no
budgets yet," the same class of gap Analytics named for its AI-insights
fetch, out of proportion to fix as part of a layout spec.

## Interactions

**Hover.** The whole card gets a hover tint (mirrors `SummaryTile`'s
`onHoverIn`/`onHoverOut`) — it is a single click target, opening
`BudgetDialog`. The two clickable summary tiles get the identical treatment.
The segmented-bar tooltip (above) is the one other hover state on this
screen, and it is supplementary to an always-keyboard-reachable path, not a
hidden one. **No hover-revealed icon buttons on the card itself** (e.g., a
corner Edit pencil that only appears on mouseover) — the whole card already
opens the one place Edit and Delete live; adding a second, hover-only path to
the same destination would be decoration, not new capability.

**Right-click.** None, deliberately. Unlike the reference screen's rows,
where a context menu gave power users a duplicate/delete path that skipped
opening a dialog entirely, a budget has no "duplicate" action anywhere in
this app (checked — `budgetStore` has no such method), and Edit/Delete are
already one click away via the card itself. Typical budget counts are also
small (a handful, not hundreds of rows), so the efficiency case a
right-click menu makes on a ledger doesn't apply here. Revisit if real usage
says otherwise — see Open questions.

**Selection.** None — no checkboxes, no bulk bar, no multi-select. Budgets
are not rows and this is explicitly List-specific per the language doc; it
does not transfer by analogy, and nothing here would benefit from it (there
is no bulk "delete 3 budgets at once" need this screen is solving for).

**Keyboard.** Tab order follows reading order: control row ("+ New Budget")
→ summary strip's two clickable tiles → each card in grid order (grouped
section by section) → (inside an open dialog) header actions → content →
footer, exactly as `ExpenseDialog`/`CreateDialog` already establish. A card
is a real `Pressable`, focusable and `Enter`/`Space`-activatable, opening
the same dialog a click does.

**Dialogs.** Two: `BudgetDialog` (view/edit an existing budget) and
`BudgetCreateDialog` (create one). Both built on RN's own `Modal`, both with
a raw, tab-index-less `<div>` scrim — the same verified-against-source
reasoning `ExpenseDialog.tsx`'s file header documents, not re-derived here.

## Component moves

Two components currently live under `app/` and must move to `src/` before a
dialog can host them, plus one that must be extracted whole (mobile has no
`src/`-level equivalent to host at all today):

- **`app/(tabs)/budgets.tsx`'s current JSX** → `src/components/budgets/
  BudgetsMobile.tsx`, moved unchanged (mirrors `ExpensesMobile.tsx`). New
  gate pair `src/components/budgets/BudgetsView.tsx` (native, renders
  `BudgetsMobile`) and `BudgetsView.web.tsx` (renders `useIsDesktopWeb() ?
  BudgetsDesktop : BudgetsMobile`), mirroring `ExpensesView.tsx`/`.web.tsx`
  exactly. `app/(tabs)/budgets.tsx` becomes a one-line wrapper.
- **`app/budget/new.tsx`'s form body** → `src/components/budgets/create/
  BudgetCreateForm.tsx`, taking `{ initial?, onDone }`, mirroring
  `ExpenseCreateForm`'s exact shape. `app/budget/new.tsx` becomes
  `<BudgetCreateForm onDone={() => router.back()} />`.
- **`app/budget/[id].tsx`'s non-editing JSX** (header card, period nav,
  progress card, category breakdown, details card, `BudgetHistorySection`)
  → `src/components/budgets/detail/BudgetDetailView.tsx`, taking
  `{ budget, onEdit, onDelete }`, keeping its own period-nav state exactly as
  the route does today — a pure code move, zero behaviour change.
  `app/budget/[id].tsx` becomes the guard clauses plus the same `isEditing`
  switch it has today, just between `<BudgetDetailView>` and
  `<BudgetEditForm>` instead of between itself and `<BudgetEditForm>`.
- **New, desktop-only, no mobile equivalent to extract**:
  `src/components/budgets/desktop/BudgetsDesktop.tsx` (screen composition:
  control row, summary strip, grouped grid), `BudgetCard.tsx` (the grid
  card, including the segmented bar/legend), `BudgetDialog.tsx`,
  `BudgetCreateDialog.tsx`.
- **Not moved, reused as-is**: `src/components/budget/BudgetEditForm.tsx`,
  `src/components/budget/BudgetHistorySection.tsx`,
  `src/components/BudgetCategoryEditor.tsx`, `CreateCategoryModal.tsx`. The
  existing singular `budget/` folder and the new plural `budgets/` folder
  are a pre-existing naming inconsistency (mobile's own tab and route are
  named `budgets`/`budgets.tsx`, but the two components that already lived
  in `src/` used the singular form) — not introduced or fixed here; new
  structure follows the plural convention the reference/Analytics screens
  established, and the two existing files are simply imported from their
  current location.
- **Recommended, not required**: a small pure util, e.g.
  `src/features/budgets/budgetGrouping.ts`, exporting a `classifyBudget`
  (over/nearing/onTrack/inactive) and a grouping/counting function — mirrors
  `desktopTable.ts`'s `summarise`/`facetValue` and `periodNav.ts`, and is
  what this repo can actually unit-test (nothing here renders a component in
  CI).
- **Store-level, required**: widen `budgetStore.loadBudgets()`'s `isLoading`
  window to also cover the server-pull phase — see States.

## Departures from the design language

**On-track fill colour: `success`, not mobile's `primary`.** Mobile's card
uses the accent-derived `primary` for the under-threshold fill; this screen
uses the semantic, non-accent-derived `success` instead, for the "danger/
warning/success are deliberately not accent-derived" reasoning the language
doc states under Universal colour rules — this screen is fundamentally a
status display (over/nearing/on-track), which is exactly the case those
tokens exist for. This is a considered divergence from what mobile visually
shows today, not a silent one — flagged here, and again under Open
questions, since it means the same budget could render a different shade on
phone vs. desktop at the same percentage.

**Grouping threshold uses the budget's own `alertThreshold` (falling back to
80%), not mobile's hardcoded 80%.** The field already exists, is already
user-set at creation, and is already what the server's own push-notification
threshold check (`checkCategoryThresholds`) uses — aligning the visual
grouping with the mechanism that already alerts the user at that number is a
deliberate, reasoned choice, not an arbitrary aesthetic one. It also means a
budget could show a different colour on desktop than on mobile at the exact
same percentage, for a user who set a custom threshold — flagged plainly,
same as the above, and revisited under Open questions.

**Delete relocated from the bottom of the scrolled content into the dialog
header, alongside Edit — both now `canEdit`-gated, which mobile's `[id].tsx`
currently is not.** Reasoned in Layout above; restated here because it is a
genuine behavioural difference (a viewer opens this dialog on desktop and
sees neither button; on mobile today they see both, unconditionally).

No other departures. The absence of a facet rail, day-grouping, and
checkbox selection are conformance to the List-specific/Universal split, not
departures from it.

## Open questions

- **Whether the segmented multi-category bar + hover tooltip is legible and
  worth the visual complexity**, versus a plainer treatment (e.g., just the
  compact legend with no segmented fill). A judgement call for the product
  owner's eye, not decidable from the code.
- **Whether grouping/colouring by the budget's own `alertThreshold` instead
  of a fixed 80% will read as inconsistent between phone and desktop** for a
  user who checks the same budget on both — named above as a deliberate
  choice, but genuinely undecidable without watching a real user notice (or
  not notice) the difference.
- **Whether two broad groups (Needs Attention / On Track) is the right
  granularity**, or whether "Over" and "Nearing limit" deserve their own
  top-level sections rather than a badge distinction inside one group — a
  content-hierarchy call, not a layout one.
- **Whether the empty state should offer preset/template chips** (e.g.,
  "Groceries", "Overall spending") that pre-fill `BudgetCreateDialog`.
  Deliberately not built here — a real, cheap idea, but one that implies a
  small templated-budgets feature that hasn't been asked for or validated;
  worth a product decision, not a default in a layout spec.
- **Whether the 1024–1439 "no named branch" claim actually holds at, say,
  1100–1280px** — the arithmetic checks out; only a deployed screen can say
  whether it also looks right, per the language doc's own standing caveat
  about this band.
- **Whether an outer max-width ceiling belongs on ultra-wide monitors** —
  this spec adds none, matching the reference/Analytics precedent, and the
  same "nobody has looked yet" caveat applies.
- **Whether moving Delete into the dialog header reads well once real
  content (a long category breakdown plus a 6-period history chart) sits
  beneath it** — only a deployed dialog with real data can say.
- **Light theme and both width regimes, on the deployed screen.** Same
  standing caveat as both prior screens: checked by eye once shipped, never
  before — nothing in this repo renders a component in CI.
