# Dashboard — Desktop Web Design

This is the fourth screen, and the only one that did not start from a
stretched phone screen. ABA-289/290 already gave it a two-column widget
layout, hid the mobile hero header, and neutralised the quick-action strip's
overlap margin — before `docs/contracts/desktop-web-design-language.md`
existed. That layout is now **superseded**, not extended: the product owner
picked a specific structure from mockups — a fluid focus area on the left and
a fixed-width standing rail on the right — and this spec folds that decision
in rather than proposing a different one. Where ABA-289/290's choices still
hold (which is most of them — the hero stays hidden, the strip stays retired
on desktop, most widgets are untouched), I say so and why; where they don't
(the two-equal-column split, most centrally), I say what replaces them and
why the replacement is not a third structural idea layered on top of a
second.

**What's on the shipped mobile screen today, read from the code, not
guessed:** `app/(tabs)/index.tsx` renders an orange hero (`HomeHeroHeader` —
account/currency pills, an alerts bell with an unread badge, a settings
button, and — only here — a "Safe to Spend Today" row that opens
`SafeToSpendSheet`, a bottom sheet), a quick-action strip (`HomeQuickActionStrip`
— 10 possible actions, 8 visible by default, rendered as a centred, wrapping
grid of icon-over-label buttons; a `shopping_hub` entry opens a second bottom
sheet with two rows), and — inside one `ScrollView`, below both — up to 13
widget cards (a 14th key, `safeToSpend`, deliberately renders nothing as a
card; see Goal) in a user-configurable order and visibility
(`widgetVisibilityStore`, with its own Settings screen), plus an
account-type-gated `InvestmentCard` that renders first and is **not** part of
that configurable order at all. `NewBadgeModal`, a celebratory fade-centred
overlay, is mounted unconditionally at the bottom. Pull-to-refresh
(`RefreshControl`) reloads every widget's backing store.

## Goal

Let someone glance at their account's current financial story — what's safe
to spend today, how this month is trending, and everything else worth a
scan — without navigating anywhere, and reach the handful of things they do
constantly (log an expense, log income, scan a receipt) in one click.

### Whether any two widgets answer the same question

Three things worth naming, one of them a genuine, checkable content loss —
exactly the kind of thing this project has silently dropped twice before by
skipping this step.

1. **A real, checkable loss: Safe-to-Spend is completely absent on desktop
   today.** `HomeHeroHeader` is the *only* place that renders the
   safe-to-spend number and the tap-through to its breakdown — `(tabs)/
   index.tsx` hides that whole header on desktop web (`{!isDesktopWeb &&
   <HomeHeroHeader .../>}`) with nothing standing in for it, and
   `renderHomeWidget('safeToSpend', ...)` explicitly returns `null` ("shown as
   the home hero number... no duplicate dashboard card — the hero is the
   single in-app surface for this value"). That comment was true when it was
   written; it stopped being true the moment the hero was hidden on desktop.
   Per CLAUDE.md this is "the home hero number (#1)" of the app's own feature
   list — not a minor card. This has to be fixed, not merely noted; see
   Layout.
2. **This month's income, this month's expenses, and their difference are
   computed three separate ways and would all be on screen together were it
   not for where the chosen layout puts them.** `IncomeExpensesCard` shows
   `convertedIncomeTotal`/`convertedExpenseTotal` (from `exchangeRateStore`,
   itself derived from each store's own `*TotalsByCurrency`, both current-
   month aggregates). `NetProfitWidget`'s headline number is the same two
   figures' difference, computed a second time from raw `expenses`/`incomes`
   filtered to the current month inside its own `useMemo`. `CalendarWidget`'s
   footer row computes the same pair a third way, via `useCalendarData`, for
   whatever month is currently paged inside that specific widget. On a phone,
   scrolled past one at a time, this is invisible; stacked in one column it
   would read as the same fact stated three times. **This is resolved by
   structure, not by dropping a widget** — see Layout's "Why the focus
   column's order is a narrative, not a coincidence." Unlike Analytics or
   Budgets, these are independently user-toggleable widgets with their own
   Settings-screen visibility switches; silently omitting one that a user
   turned on would contradict a setting they explicitly control, which
   Analytics' fixed, non-configurable sections never had to weigh.
3. **Looks like the same case, isn't — CalendarWidget's footer is a live,
   independently-paged view, not a restatement.** Its income/expense/net
   figures are for whatever month its own prev/next arrows currently show,
   defaulting to the current month on first render. By default, before any
   navigation, it is numerically identical to the current month's figures
   above — but it is a genuinely separate, user-drivable view (and it stays
   in the rail, not the focus column — see Layout), so nothing about it
   changes here.
4. **NetCapitalWidget is not a restatement of NetProfitWidget** despite
   sitting one key apart in `WIDGET_KEYS` and both starting with "Net" — one
   is a stock (total wallet balance across all currencies, right now), the
   other a flow (this month's income minus expenses, plus a trend). Distinct
   questions; both are reused unchanged, in the rail.

## What each mobile affordance becomes

| Mobile today | Desktop | Why |
|---|---|---|
| Orange hero — account/currency pills, alerts bell, settings | Unchanged, in `WebTopBar` (already shipped by ABA-289/290) | Universal chrome rule: navigation and identity controls live in the top bar |
| Orange hero — "Safe to Spend Today" row → `SafeToSpendSheet` (bottom sheet) | **Restored**, folded into the top of the focus column's hero card (see Layout); tap opens the same `SafeToSpendSheet`, now rendered as a centred dialog on desktop | Closes the silent content loss named in Goal §1. Universal dialogs rule also applies independently: a bottom sheet is a phone idiom regardless |
| Quick-action strip (`HomeQuickActionStrip`, 8-of-10 icons, centred wrapping grid) | **Retired on desktop.** A fixed, small, always-there 4-item list (+ Expense primary, then Income / Scan Receipt / Voice) lives at the top of the rail instead | See Layout's "What the quick-action strip becomes." `HomeQuickActionStrip` itself is untouched — it simply isn't part of the desktop tree |
| `shopping_hub` → bottom sheet (2 rows) | Not reachable from the desktop Dashboard at all (see Layout) | Argued departure, not a silent drop — see Departures |
| Pull-to-refresh (`RefreshControl`) | Dropped, no replacement | Matches the reference/Budgets precedent exactly — `ExpensesDesktop`/`BudgetsDesktop` both drop `onRefresh` with no substitute |
| `familyFeed` widget | Rail, reused as-is (only shown for non-personal accounts, unchanged) | Its ~86px-wide story bubbles were sized for a phone; the rail is close enough to phone width that nothing changes |
| `safeToSpend` (rendered as `null`, no card) | **New**: folded into the hero (see row above); no separate rail card | — |
| `inflationShield` widget | Rail, reused as-is | Compact figure + one tip line; already phone-width-appropriate |
| `financialHealth` widget | Rail, reused as-is, **except** its internal detail Modal | See "The two sheets that must stop being sheets" in Layout |
| `gamification` widget | Rail, reused as-is (this is the "streak" the product owner named) | — |
| `monthlyBudget` widget (plain progress bar, blended across active monthly budgets) | Focus column, third slot. **Gains a segmented allocation bar** when the month reduces to one contributing category-allocated budget | See Layout's "The monthly budget card's segmented bar" — genuinely new content, not merely relocated |
| `incomeExpenses` widget | Focus column, second slot, reused as-is | — |
| `debts` widget | Rail, reused as-is | — |
| `netProfit` widget (fixed 6-month chart, no range control, no tap target) | Focus column, first slot — the hero. **Gains** an optional Safe-to-Spend eyebrow row, a 3M/6M/12M range control, and a range-driven history length | Backward-compatible additive props (mobile passes none, gets today's exact output) — see Layout |
| `netCapital` widget | Rail, reused as-is | — |
| `fatFinder` widget | Rail, reused as-is | — |
| `calendar` widget | Rail, reused as-is | — |
| `goals` widget | Rail, reused as-is | — |
| `wallets` widget (horizontal-scroll currency chips) | Rail, reused as-is | The rail's ~300px is close to the chips' own mobile container width; horizontal scroll is unchanged, appropriate behaviour, not a phone tell here |
| `InvestmentCard` (account-type-gated, rendered first, outside the ordered system) | Rail, first among widgets (after the fixed quick-list), reused as-is | Pre-existing "always first, not reorderable" quirk carried over unchanged — see What I'm deliberately not changing |
| `NewBadgeModal` | Unchanged | Already a fade-centred overlay, not a sheet — nothing to convert |
| Widget order/visibility Settings screen | Unchanged, governs both platforms | The rail's stacking order is this same array, filtered — see Layout |
| — (new) | Focus-column fallback rule when its widgets are hidden | See Layout — a defined behaviour, not left to chance |

## Layout

### Why this shape, and why the widths just work

The product owner's stated reasoning — "it inherits the shape the
transactions screen already established... rather than introducing a fourth
structural idea" — is echoed here because it also explains something the
original report couldn't: **the rail's fixed ~300px width is close to what
every one of these widgets was already designed for.** `CalendarWidget`,
`NetCapitalWidget`, `FatFinderCard`, `DebtsCard`, `GoalsCard`,
`InflationShieldWidget`, `GamificationCard`, `InvestmentCard`, `WalletsSection`
and `FamilyFeedWidget` were all built for a phone's ~330–400px content column.
A 300px rail is that same regime, not a stretched one — which is precisely
why the reported symptom ("Financial Health is a label and a score ring... a
progress bar" occupying a much wider card, "mostly whitespace") existed in
the first place: the ABA-289/290 two-column split gave each of these an
~880px-wide `flex:1` column, four to five times its designed width, with
nothing to fill the difference. **None of these ten widgets needs a single
line changed.** They are reused, unmodified, at the width they were always
meant for.

### The focus column

A fixed template of three independently-optional slots, top to bottom:

1. **Hero** — the extended `NetProfitWidget` (see below): an optional
   Safe-to-Spend eyebrow row, the net-profit headline and 6-month-equivalent
   trend chart, and a 3M/6M/12M range control under the chart.
2. **`IncomeExpensesCard`**, reused as-is.
3. **`MonthlyBudgetCard`**, reused as-is except for an optional segmented
   allocation bar (see below).

**Why this order is a narrative, not a coincidence** — this is how Goal §2's
three-way redundancy resolves without dropping anything a user turned on:
read top to bottom, this is "here's this month's net result and its trend →
here are the two halves that produced it → here's what's left in your plan."
Stacked deliberately in this order, in one place, it reads as one story told
at three resolutions — the same relationship the reference screen's own
`SummaryStrip` has with `TransactionTable` beneath it, applied to a vertical
narrative instead of a summary-then-detail pair. `CalendarWidget`'s own
version of the same two figures stays in the rail, physically apart from this
column, which is most of why it doesn't read as a fourth repetition — see
Goal §3.

**The fallback rule, stated plainly (this is the chosen layout's one real
weakness, and closing it is this spec's job):** each of the three slots is
independently visible only when its backing widget(s) are visible and have
something to show. Slot 1's two halves are independently optional too — the
Safe-to-Spend row shows only when `widgetVisibility.safeToSpend &&
hasEnoughData`, the net-profit block only when `widgetVisibility.netProfit`;
if both are off, slot 1 doesn't render at all, and slot 2 becomes the visual
top. Slot 3 (`monthlyBudget`) already carries its own real "nothing to show"
condition unchanged from mobile (`monthlyBudgetSummary.budgetCount === 0`).
**This is ordinary top-to-bottom flow, not a promotion algorithm** — there is
no code that decides "since the hero is hidden, promote X into its place";
whatever is next in the fixed template simply becomes the first thing shown.
**If all three slots collapse** (every one of `safeToSpend`, `netProfit`,
`incomeExpenses`, `monthlyBudget` hidden or without data), the focus column
does not render as a blank void beside a populated rail — it shows one
centred message ("Your main view is turned off — turn on Safe to Spend, Net
Profit, Income & Expenses or Monthly Budget to see it here") with a link to
the widgets Settings screen. This is the one genuinely new empty state this
spec adds; every other widget already degrades gracefully on its own (see
States).

**A consequence worth stating outright, and a real departure**: because the
focus column is a fixed three-slot template, **these four keys' position
within `widgetOrder` no longer determines where they render on desktop** —
only their visibility does. A user who has, say, dragged `monthlyBudget`
above `netProfit` in the mobile reorder screen will still see Net Profit
first on desktop. This is a deliberate trade the chosen layout makes — a
stable, always-legible "lead story" — not an oversight; argued further under
Departures.

### The two sheets that must stop being sheets

Independent of column vs. rail, two of this screen's own "learn more" panels
are bottom sheets today and both trip the same Universal rule (§3 — no
bottom sheet for a detail) the *same* way: both use a `Modal` with a
`Pressable`/`TouchableOpacity` backdrop rather than a raw `<div>` scrim, so —
per the rule's own reasoning — that backdrop currently sits in the keyboard
tab order as an invisible focus target on web already, sheet or not.

- **`SafeToSpendSheet`** gains a `desktop?: boolean` prop, following the
  established `InflationIndexSection` convention exactly (§5a): `true` swaps
  the slide-up sheet chrome and `TouchableOpacity` backdrop for a centred
  dialog and a raw `<div>` scrim; the row content (wallet, expected income,
  subscriptions, etc.) is untouched. Mobile's own call passes nothing.
- **`FinancialHealthWidget`**'s internal breakdown Modal gets the identical
  treatment, same prop name, for the same reason — its backdrop is also a
  bare `Pressable` today.

Neither of these lives under `app/` — both already live under
`src/components/`, so no file move is required, only the prop.

### Net Profit chart width — my reading, not a guess

The product owner's own question, and now the more important one, since this
chart leads the whole screen. Read in full, `InteractiveLineChart.tsx` does
**not** call `useContentWidth()` at all — confirmed by grep across the
codebase; only `InteractiveBarChart`, `WalletMonthlyChart` and
`InsightCarousel` do. It already measures its own container via `onLayout` →
local `chartWidth` state, which is precisely the pattern the language doc
cites as correct (§5a: "the same way `InteractiveLineChart` already does") —
this component is the *reference* implementation the bar chart was fixed to
match, not a second instance of that bug.

The spacing math bears this out algebraically. `spacing =
Math.max(30, (chartWidth - 16) / (data.length - 1))`; for 6 points and any
`chartWidth ≥ 166`, this makes the plotted content's width exactly
`16 + 5 × spacing = chartWidth` — the line is engineered to fill whatever
width it measures, independent of the data's values. So if the container is
measured correctly, "draws in the leftmost tenth" is not explainable by this
formula at all — the result is either full-width, or (only below 166px) a
fixed, small, still-centred content block, never a large box mostly empty on
one side.

**My reading: the far more likely explanation is the data, not the layout.**
`NetProfitWidget` hardcodes exactly 6 months regardless of how much history
the account actually has (`Array.from({ length: 6 }, ...)`), with no "not
enough data" branch at all (unlike `NetCapitalWidget`, which does have one).
A lightly-used or newly-created account — the same class of account the
product owner already flagged as a possible source of "sparse"-looking
findings — would show several genuinely-zero months, an area-fill hugging
the baseline, and a single real spike; at a glance that can read as "content
in a small part of the box, empty elsewhere," especially if the one
non-trivial month happens to sit toward the left of the window. This is a
*data-range* problem, and the fix the product owner already asked for — the
3M/6M/12M range control — is also the right fix for it: a shorter default
range for a thin-history account shows fewer, denser, more legible points
instead of mostly-empty months.

I cannot rule out a first-paint measurement race with certainty from source
alone — nothing in this repo renders a component in CI, so a genuine
`onLayout` timing issue inside a two-column flex row is not something I can
confirm or deny by reading. But I can say the self-measurement code is
sound and is not the documented bug class; if the symptom persists after the
range control ships, that is where to look next, not at chart width math.

**The trap I must not ask anyone to "fix":** `chartClip`'s wrapper is
deliberately `{ width: '100%', overflow: 'hidden' }` with **no fixed
height** — gifted-charts draws the below-x-axis negative region *beyond* the
passed `height` prop, and a fixed-height wrapper would silently clip it.
Adding the range control makes this more relevant, not less: switching range
changes the data's min/max, which changes `noOfSectionsBelowXAxis`, which
genuinely changes the card's total rendered height across range selections —
**that is correct, expected behaviour**, not a layout bug to paper over with
a fixed-height container to stop the hero card from "jumping" when the range
changes.

### `NetProfitWidget`'s new props, precisely

Three independent, additive, backward-compatible pieces — mobile's own call
site (`renderHomeWidget`) passes none of them and gets today's exact output:

- `safeToSpend?: { data, hasEnoughData, onPress }` — renders a small eyebrow
  row above the existing subtitle/headline when present.
- `showRangeChips?: boolean` (default `false`) — renders a 3M/6M/12M segmented
  control under the chart when `true`; the component owns the selected range
  as its own local state (no lifting required).
- The month-count array (`Array.from({ length: 6 })`) generalises to
  `Array.from({ length: monthsForRange(range) })`, `range` defaulting to
  `'6m'` — algebraically identical to today's output when nothing is passed.

### The monthly budget card's segmented bar

`BudgetsDesktop`'s `BudgetCard.tsx` already implements exactly this — a
progress bar segmented by category with a compact colour-dot legend — but it
operates on **one** budget's own `categoryAllocations`
(`progress.categoryBreakdown`). `MonthlyBudgetCard`'s
`getMonthlyBudgetSummary()` is a **blend across every active monthly
budget**: when a single category-less "overall" budget exists, it returns
that one budget's own totals alone (and there is nothing to segment — an
overall budget by definition has no allocations); otherwise it sums every
active, category-allocated monthly budget together into one number.

**What this spec commits to:** when the month reduces to exactly one
contributing category-allocated budget (`activeMonthly.length === 1` in the
non-overall branch), the card renders a real segmented bar, reusing the
*same* segment data `BudgetCard` already computes
(`getBudgetProgress(id).categoryBreakdown`) via a small new pure util,
`src/features/dashboard/monthlyBudgetSegments.ts`. **What this spec does
not commit to:** merging two or more simultaneously-active monthly budgets'
allocations into one combined segmented view — whether same-named categories
across two budgets should read as one segment or two is a real design
question the mockup didn't specify, and inventing an answer here risks
getting it wrong quietly. In that rarer multi-budget case, the card falls
back to its existing plain fill, unchanged. Flagged under Open questions.

The segmented-bar *rendering* itself (the coloured slices plus legend) should
be extracted out of `BudgetCard.tsx` into a small shared
`SegmentedProgressBar` component, so `MonthlyBudgetCard` reuses the exact
same drawing code rather than a second copy of it; `BudgetCard`'s own output
is unchanged by the extraction.

### The rail

Below the fixed quick-list (next), in order: `InvestmentCard` (if the account
is investment-type — its existing "always first, not part of the
reorderable set" special case, unchanged), then every remaining `WIDGET_KEYS`
entry **except** the four now living in the focus column
(`safeToSpend`, `netProfit`, `incomeExpenses`, `monthlyBudget`), in the user's
own `widgetOrder`, filtered — nothing else about that order changes. A user
who moved `debts` above `financialHealth` sees that relative order preserved
in the rail exactly.

**When the rail is nearly empty** (most widgets hidden): it simply ends —
there is no minimum height and no filler content. This is not the
List-specific facet rail (which always lists every facet, including
zero-count ones, so it never looks broken by being short) — it is a stack of
the user's own chosen cards, and a short stack ending in whitespace is the
expected shape of "I turned most of this off," the same way a short sidebar
naturally behaves.

**When the rail is much longer than the focus column** (most/all widgets
on): both columns live inside the **same** single `ScrollView` — the
existing pattern the ABA-289/290 two-column layout already used
(`webTwoCol`/`webCol` as plain, non-scrolling `View`s) — so the shorter
column (usually the focus column, three fixed slots) simply ends, and the
page's one scrollbar keeps moving to reveal the rest of the rail. This
satisfies "one page scroll per screen" exactly as it satisfies it in the
list layout today; only the constituent columns change shape.

**Sticky is a genuine, open option here, not a default.** The classic
sidebar-sticks-while-content-scrolls pattern doesn't map cleanly: in the
typical case it is the *rail* that runs longer, not the focus column, so
pinning the (shorter) focus column while the rail's remainder scrolls past
beneath it is the direction that would actually apply — keeping "today's
number" in view while browsing everything else, which could be genuinely
good or could feel like the page never finishes loading. This app already
uses `position: sticky` for the reference screen's table header, so the
technique is available and precedented; I'm not recommending it as a default
because the product owner didn't ask for it and it cuts both ways
aesthetically. Flagged under Open questions.

### What the quick-action strip becomes

The rail's own fixed, first item — **not** sourced from `quickActionStore` at
all: a small vertical list, "+ Expense" as the one primary (filled) button,
then "Income" / "Scan Receipt" / "Voice" as three smaller secondary rows.
"+ Expense" → `/expense/new` (`add_expense`'s existing route). "Scan Receipt"
→ `/expense/receipt` (`scan_receipt`'s existing route). "Voice" →
`/expense/voice` (`voice_expense`'s existing route, the one visible by
default — not the hidden-by-default `voice_income`). **"Income" is new**:
there is no manual "create an income" quick-action key today at all
(`voice_income`/`scan_invoice` exist, a plain `/income/new` shortcut does
not) — this reads it as the create-income counterpart to "+ Expense," routes
to `/income/new`, and reuses the existing `incomes.addIncome` i18n key
verbatim (already used by `ExpensesDesktop`'s own income button — no new
translation needed).

This list is fixed, not user-configurable, and does not read or write
`quickActionStore` — a deliberate choice, argued under Departures, since the
product owner named these four specific actions as part of the layout
itself, not as "whichever quick actions happen to be enabled."

**The other five-to-six configured quick actions** (`exchange`, `converter`,
`transfers`, `subscriptions`, `shopping_hub`, plus `voice_income`/
`scan_invoice` for anyone who has turned them on) **have no dedicated
desktop-Dashboard shortcut in this spec.** None of them becomes unreachable —
exchange/transfers live on the Wallet screen, subscriptions has its own tab
entry and a Settings-hub row, the shopping list has its own entry points too
— only the "one tap from Home" convenience is not reproduced here. Argued
under Departures; a compact "more actions" affordance for these is a real,
considered idea, deliberately left to a product decision rather than
invented here — see Open questions.

### Wireframe, ≥1440px

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ WebTopBar: AI Budget · Dashboard Expenses Budgets Analytics AI Chat  [acct][$][🔔][⚙] │
├──────────────────────────────────────────────────────── ┬─────────────────────────────┤
│  FOCUS COLUMN (fluid)                                    │  RAIL (300px, fixed)        │
│ ┌────────────────────────────────────────────────────┐  │ ┌─────────────────────────┐ │
│ │ Safe to spend today: 84 zł                       ›  │  │ │ [+ Expense]             │ │
│ │ Net profit this month          +1 240 zł            │  │ │  Income  Scan  Voice    │ │
│ │  ╭╮      ╭───╮                                      │  │ └─────────────────────────┘ │
│ │ ╭╯╰──────╯   ╰──╮                                   │  │ ┌─────────────────────────┐ │
│ │╯               ╰──────────────                      │  │ │ 📈 Portfolio   $12,400  │ │  investment
│ │  [3M] [6M] [12M]                                     │  │ │    +1.2% today          │ │  (if applicable)
│ └────────────────────────────────────────────────────┘  │ └─────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐  │ ┌─────────────────────────┐ │
│ │ Total income        +3,200 zł │ Total expenses -1,960 │  │ │ ⭐ Financial Health  82 │ │
│ └────────────────────────────────────────────────────┘  │ └─────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐  │ ┌─────────────────────────┐ │
│ │ Monthly Budget · 10 Aug – 9 Sep                      │  │ │ Level 4 ▓▓░  🔥 6 days  │ │
│ │ 340 zł of 500 zł                                     │  │ └─────────────────────────┘ │
│ │ ▓▓▓▓▓▓▓░░ groceries ▓▓ household ▓ other  68%        │  │ ┌─────────────────────────┐ │
│ └────────────────────────────────────────────────────┘  │ │ 👤 owes you   400 zł    │ │
│                                                           │ │ 👤 you owe    120 zł    │ │
│                                                           │ └─────────────────────────┘ │
│                                                           │ ┌─────────────────────────┐ │
│                                                           │ │ 📅 September    ‹ ›    │ │
│                                                           │ │  ...calendar grid...    │ │
│                                                           │ └─────────────────────────┘ │
│                                                           │      ...rest of rail...     │
└──────────────────────────────────────────────────────── ┴─────────────────────────────┘
        one page scroll for both columns together, no independent scrollers
```

### What changes at 1024–1439

**Nothing structural.** At 1024px, a 300px rail plus an ~24px gap and the
page's own padding leaves roughly 660–680px for the focus column — generous
enough for a legible chart (the hero was already effectively this width
under the old two-equal-column layout, which the report was taken from) and
plenty for the two-up income/expenses card and the budget card, both
originally sized for a ~330–400px phone column. No named width-band branch
is needed the way Analytics' asymmetric breakdown grid needed one. The one
place actually worth watching is the rail's *proportion* of the window — 300
of 1024px (~29%) is noticeably heavier than 300 of 1920px (~16%); the
arithmetic doesn't flag a problem, but this is, per the language doc's own
standing caveat, a prediction until someone looks at a real 1100px screen.

## States

**Loading.** Widened `useHydrationStore.isHydrating` (the exact mechanism
Analytics and Budgets each added for their own single data source) gates the
whole screen behind one spinner on first paint — but stated honestly, this
covers only the transaction-derived cards (`netProfit`, `incomeExpenses`,
`financialHealth`, `calendar`). The remaining widgets each own an
independent store (`walletStore`, `debtStore`, `investmentStore`,
`goalStore`, `familyFeedStore`, `insightsStore`) with no shared "everything
is loaded" flag — so on desktop web's cold, no-SQLite start, several rail
cards can individually flash their own "no data yet" empty state for a
moment before their own pull resolves. This is a real, wider gap than a
layout spec should try to close in one pass — Analytics/Budgets each solved
this for *one* store; Dashboard would need one for eight-plus. Flagged, not
fixed, under Open questions.

**Empty account.** Almost every widget already degrades gracefully on its
own — `WalletsSection`, `DebtsCard`, `GoalsCard` and `FatFinderCard` all ship
their own "get started" invitation, unchanged, and `InflationShieldWidget`
correctly disappears rather than showing a broken card. `MonthlyBudgetCard`
already hides itself when there are no active monthly budgets. The one
genuinely new empty state is the focus column's all-three-slots-hidden case
(see Layout) — everything else is reused exactly as it already behaves.

**Populated.** As designed above.

**Error.** No dedicated error UI, matching every widget's own precedent —
none of these stores render their `error` field today, and this spec does
not start.

## Interactions

**Hover.** No new hover treatment is added at the grid/rail level. Every card
that navigates is already a `Pressable`/`TouchableOpacity`, which gets
`cursor: pointer` for free on web; most of these cards also already carry a
visible 2px border, so a second hover tint risks reading as doubled chrome
rather than affordance, unlike the reference/Analytics/Budgets screens' bare
`SummaryTile`s, which have no border to compete with.

**Right-click.** None — no widget has a secondary action a context menu
would shortcut.

**Selection.** None — no rows, no bulk actions.

**Keyboard.** Tab order follows reading order: the rail's fixed quick-list
→ the focus column's three slots, top to bottom → the rail's own cards, in
`widgetOrder`. Each navigating card is a real, focusable, `Enter`/`Space`
-activatable `Pressable`.

**Dialogs.** Two: `SafeToSpendSheet` and `FinancialHealthWidget`'s breakdown
panel, both centred on desktop via their new `desktop` prop, both built on
RN's own `Modal` with a raw `<div>` scrim — the same verified-against-source
reasoning `ExpenseDialog.tsx` already documents, not re-derived here.

## Component moves

- `app/(tabs)/index.tsx`'s current JSX → `src/components/home/
  DashboardMobile.tsx`, moved unchanged (mirrors `ExpensesMobile.tsx`). New
  gate pair `src/components/home/DashboardView.tsx` (native) / `.web.tsx`
  (`useIsDesktopWeb() ? DashboardDesktop : DashboardMobile`).
  `app/(tabs)/index.tsx` becomes a one-line wrapper.
- **New, desktop-only**: `src/components/home/desktop/DashboardDesktop.tsx`
  (composition: one `ScrollView`, focus column + rail), `FocusColumn.tsx`
  (the three-slot template + its own empty state), `DashboardRail.tsx` (fixed
  quick-list + `InvestmentCard` + the filtered widget stack).
- **Extended, additive props only**: `NetProfitWidget.tsx`
  (`safeToSpend?`, `showRangeChips?`, range-driven history length —
  see Layout), `SafeToSpendSheet.tsx` (`desktop?: boolean`),
  `FinancialHealthWidget.tsx` (`desktop?: boolean` on its internal Modal),
  `MonthlyBudgetCard.tsx` (`segments?` — undefined on mobile, unchanged
  output).
- **Extracted, no behaviour change**: `SegmentedProgressBar` pulled out of
  `BudgetsDesktop`'s `BudgetCard.tsx` into its own shared component;
  `BudgetCard`'s own rendering is identical after the extraction.
- **Recommended, new, small**: `src/features/dashboard/
  monthlyBudgetSegments.ts` — a pure util computing segments only for the
  single-contributing-budget case (see Layout), mirroring
  `budgetGrouping.ts`'s precedent from the Budgets spec.
- **Not touched at all**: `HomeQuickActionStrip.tsx` (retired from the
  desktop tree, not modified), `WalletsSection.tsx`, `FamilyFeedWidget.tsx`,
  and every other rail widget — reused exactly as shipped.

## Departures from the design language

**The focus column's fixed slot order overrides `widgetOrder` for those four
keys.** Stated plainly in Layout: this is a real behavioural difference from
every other widget on this screen, which do respect the user's own ordering.
The trade is deliberate — a stable, always-in-the-same-place "lead story" is
what the product owner's chosen layout is *for*; making it fully
order-driven would reintroduce the "which widget is at the top today"
unpredictability the tile-based alternative would have had, and is exactly
what a designated focus means.

**A new, fixed, non-configurable quick-action list that doesn't read
`quickActionStore`.** Every other configurable surface in this app respects
its own settings; this one deliberately doesn't, because the product owner
named four specific actions as part of the layout's own shape, not as a
rendering of whatever the user has toggled on mobile. Revisit if this reads
as inconsistent once shipped — see Open questions.

**Five-to-six existing quick actions lose their one-tap-from-Home shortcut on
desktop, with no substitute offered here.** Not a silent drop — each remains
reachable through its own screen or Settings — but it is a real reduction in
directness for those specific actions, named here rather than left for
someone to notice later.

No other departures. The absence of a facet rail, day-grouping, and
selection are conformance to the List-specific/Universal split, not
departures from it — nothing on this screen is a row.

## What I'm deliberately not changing

- **`WebTopBar`/`WebSidebar`** — already correct per the design language,
  untouched.
- **Every rail widget's internals** except the two Modal-chrome props named
  above — no widget's data, computation, or mobile JSX changes.
- **`InvestmentCard`'s pre-existing "always first, outside `widgetOrder`"
  special case** — carried into the rail exactly as it behaves today, not
  reconciled into the ordering system as part of this pass.
- **Navigation destinations for every rail card that isn't itself a tab**
  (`/debts`, `/goals`, `/calendar`, `/achievements`, `/investment`,
  `/inflation-shield`, `/fat-finder`, `/family-feed`, `/wallet`) — none of
  these screens have their own desktop treatment yet, so clicking through
  from the Dashboard still lands on a stretched mobile layout. Expected, and
  explicitly out of scope — "which screens deserve this treatment, and in
  what order" is still unproven per the language doc, and this spec doesn't
  pre-empt that list.
- **`NewBadgeModal`** — already correct (fade-centred, not a sheet), no
  change needed.
- **No new data or store method beyond the one small, recommended
  `monthlyBudgetSegments` util** — every other number on this screen is
  computed exactly where it already is.
- **No facet rail, no day grouping, no row selection** — this screen has no
  rows; those rules were never going to apply here regardless of column
  shape.

## Open questions

- **Whether the reported "leftmost tenth" symptom is genuinely a data-range
  artefact** (my reading, argued above) **or an unreproduced layout-timing
  race** — only a deployed screen, ideally on the specific account that
  prompted the report, can say. The range control is the right fix either
  way for the data-sparsity case; it does nothing for a measurement race if
  one exists.
- **Whether the focus column should stick while a longer rail scrolls past
  it** — a real, precedented option (the reference screen's sticky table
  header), not adopted here as a default because it wasn't requested and
  could read either as helpful or as the page never finishing.
- **Whether merging several simultaneously-active monthly budgets into one
  combined segmented bar is worth building**, and if so what happens when
  two budgets share a category name — deliberately left unresolved rather
  than guessed at.
- **Whether the fixed, fifth-non-configurable rail quick-list will read as
  inconsistent** next to a fully user-configurable everything-else — a
  genuine judgement call, not decidable from the code.
- **Whether the five-to-six quick actions dropped from the desktop Dashboard
  deserve a compact "more actions" affordance somewhere** (e.g., in
  `WebTopBar`) — a real, considered idea, deliberately not built here without
  a product decision to build it.
- **The per-widget loading-flash gap beyond `isHydrating`** — real, named
  under States, not solved by this spec.
- **The 1024–1439 band's actual look**, and **an outer max-width ceiling on
  ultra-wide monitors** (this spec adds none, matching the reference/
  Analytics/Budgets precedent of not adding one) — both predictions, per the
  language doc's own standing caveat.
- **Light theme, on the deployed screen.** Same standing caveat as every
  prior screen — nothing in this repo renders a component in CI.
