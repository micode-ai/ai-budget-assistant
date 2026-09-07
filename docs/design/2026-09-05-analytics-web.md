# Analytics — Desktop Web Design

This is the second screen. The first — the transactions list — established
`docs/contracts/desktop-web-design-language.md`. Analytics has no rows: no
ledger, no facet rail, no selection, no bulk actions, no day-grouping. Every
decision below is either a Universal rule that binds regardless (chrome,
dialogs, colour) or a fresh call this screen has to make on its own, because
nothing List-specific transfers by analogy.

**Out of scope, stated once so it isn't silently assumed:** `/analytics/drill-down`,
`/reports`, `/story`, `/wrapped`, and `/scenario-simulator` are separate routes
this screen links to. None of them has a desktop pass yet. This spec designs
the entry points on the Analytics screen and leaves those destinations exactly
as they render today — noted under Open Questions, not fixed here.

## Goal

Let someone who already knows their rough numbers see, without scrolling twice,
how much they spent and earned, whether that is more or less than usual, and
where it went — with the screen's several restatements of "where it went" and
"is this unusual" resolved into one clear leader each, and everything that
isn't that question (feature discovery, price tracking) visibly secondary to
it.

### Where two blocks answer the same question

The mobile screen asks "is this unusual" and "where did it go" more than once,
in different words, at different heights in one long scroll — invisible on a
phone because you never see two answers on screen at once. On a wide screen
you would. Three cases, and who leads:

1. **"Is this unusual?" appears three times.** `SummaryCards`' total-spent tile
   already carries two separate comparisons stacked on one card (vs the
   previous equivalent period, *and* vs the trailing 3-month average).
   `CategoryBreakdown` then repeats the second comparison per category, as a
   chip. `QuickInsights`' "Anomalies" list computes a *third*, independent
   version (current vs the previous equivalent period, per category, ≥30%)
   and prints it again as sentences. **The per-category chip in the breakdown
   leads** — it sits directly on the number it qualifies, for every category,
   with no extra section to visit. The overall vs-previous-period comparison
   stays on the summary tile (that one has no per-category equivalent to
   defer to). The separate "Anomalies" list is dropped as a top-level section
   — see decision 3 in the affordance table below; the two computations are
   not merged (they use different math and can legitimately disagree), only
   the *duplicate presentation* is.
2. **"Where did the most go?" appears twice.** `QuickInsights`' "topCategory"
   card restates, in a sentence, exactly what `CategoryBreakdown`'s own first
   (largest) row already shows. **The breakdown leads.** The sentence becomes
   a fourth stat tile ("Top Category") in the summary strip instead — same
   information, promoted to a glanceable number instead of competing with the
   breakdown lower down.
3. **"When was spending highest?" appears twice, at two granularities.**
   `QuickInsights`' "highestSpendingDay" names one calendar date;
   `SpendingTrendChart`'s tallest bar shows the same thing visually, and
   `DayOfWeekSection` answers a related-but-different question (which
   *weekday*, not which date). **The trend chart leads** for the specific
   date — the sentence card is dropped, matching the treatment above; the
   day-of-week pattern stays, because it is not the same question.

Nothing here required inventing new data. All three resolutions move or drop
*presentation*, never a computation.

## What each mobile affordance becomes

| Mobile today | Desktop | Why |
|---|---|---|
| `AnalyticsHeader` — Week/Month/Year row of 3 equal buttons | Small segmented control, same 3 options, in a persistent control row above the one scroll area | Reuses the reference screen's own view-toggle idiom (`ExpensesDesktop`'s List/Map switch) instead of mobile's full-width button row |
| `AnalyticsHeader` — prev/next month arrows + label | Same arrows + label, next to the segmented control, same row | No change in behaviour, only in neighbours |
| `AnalyticsHeader` — currency filter, horizontal `ScrollView` of pill chips | Labelled dropdown ("Currency: All ▾"), same options, opened from the persistent control row | This is the exact "horizontal row of filter pills" the language calls out as the one loudest phone tell. It was silently violating that rule before this spec; fixing it is compliance, not a departure. Kept visually distinct from `WebTopBar`'s own `CurrencyPill` (that one sets the account's global display currency; this one is a screen-local filter) so the two are never mistaken for each other |
| `SummaryCards` — "Total Spent" tile, tap → drill-down | First tile of a 4-tile Summary Strip; tap still opens `/analytics/drill-down`; gains `cursor:pointer` + hover tint on web (a mouse has no chevron-icon affordance to rely on the way a thumb does) | Reuses the reference screen's `SummaryStrip` tile idiom; the destination itself is unchanged and out of scope |
| `SummaryCards` — "Avg / day" tile, tap → drill-down | Second tile, same strip, same hover treatment | — |
| — (new tile, folded from `QuickInsights`) | Third tile: "Top Category" (name, colour dot, amount) | See "Where did the most go?" above |
| — (new tile, folded from `summary.transactionCount`) | Fourth tile: "Transactions" (count) | Previously only a fallback sentence on the total-spent card when there's no previous period to compare to; promoted to its own tile so it's always visible, not conditional |
| Story banner (full-width, mid-scroll) | Small card in a bottom "More to explore" row of 3, same destination + params | Discovery content competing with data mid-page reads worse the more room it has to compete in; demoting it costs nothing on a screen that already shows far more above the fold than a phone does |
| Scenario Simulator banner | Same row, same treatment | — |
| Financial Wrapped banner | Same row, same treatment, sparkle icon kept | — |
| `AiInsightsSection` — locked (Pro-gated) card, centred, full width | One compact tile in the Insights cluster (below), same shape as every other insight tile — icon + one-line title + one-line subtitle + small inline "Upgrade" chip | See "How a gated section should read" below |
| `AiInsightsSection` — unlocked, up to 5 expandable cards, `AiUsageBadge` in the header | Up to 5 tiles in the same 2-up Insights cluster; expand/collapse unchanged; `AiUsageBadge` stays in the cluster's header row | Merged with `QuickInsights` into one cluster — see redundancy discussion above |
| `InflationIndexSection` — header + period chips + card (headline, found-total, product list, manage/plan-a-shop/community links) | Same content, reflowed horizontally inside one wide card: headline block, product list, links rail, side by side instead of stacked | A phone has to stack these; a wide window doesn't. Internal composition described below |
| `InflationIndexSection` — tap a product → bottom sheet (rename, price-history line chart, cheapest-store list) | Centred dialog, same content | Universal dialogs rule — a bottom sheet is a phone idiom regardless of which screen embeds it. Needs the inline JSX extracted into its own component first (nothing to host through a ref otherwise) |
| `IncomeCategoryBreakdown` — donut + full list | One secondary tile in the breakdown grid (below), compact donut + top 5 + "show all" | Folded into the same generic breakdown-card treatment as Merchant/Tag/Project — see Layout |
| `SpendingTrendChart` — bar chart, tap a bar → drill-down, drill-down hint caption | Paired side by side with `DayOfWeekSection` in one row; gains `cursor:pointer` on bars; hint caption kept | First genuine "put two things side by side a phone can't" win — see Layout |
| `CategoryBreakdown` — donut (size 160) + full list with vsAverage chips | Primary (double-width) tile in the breakdown grid, larger donut, full list, chips kept | Leads the "is this unusual" and "where did it go" questions — see above |
| `MerchantBreakdown` — donut (140) + full list, conditional | Secondary tile, compact donut, top 5 + "show all", conditional (unchanged gate) | One of several equally-weighted "further cuts" of the same expense set |
| `TagBreakdown` — donut (140) + full list, conditional | Secondary tile, same treatment | — |
| `ProjectBreakdown` — list + per-project budget bar, conditional | Secondary tile; the budget-progress bar becomes an optional per-row footer in the same generic card | — |
| `DayOfWeekSection` — weekday chart + peak-day caption | Paired with the trend chart (above); caption stays inside the same card | — |
| `QuickInsights` — "topCategory" card | Dropped | Folded into the Summary Strip — see above |
| `QuickInsights` — "highestSpendingDay" card | Dropped | Same date already visible on the trend chart — see above |
| `QuickInsights` — "dailyBudgetTip" card | Kept, as one tile in the Insights cluster | Carries information neither breakdown shows |
| `QuickInsights` — "totalDiscountSavings" card | Kept, same cluster | Unique information |
| `QuickInsights` — "Anomalies" list | Dropped as a separate section | Duplicate presentation of the per-category vsAverage chip — see above. The underlying computation is untouched and still runs; only the standalone list is removed |
| `QuickInsights` — "Predictions" (budget exhaustion) list | Kept, folded into the same Insights cluster as individual tiles | Distinct question ("will I run out"), not answered elsewhere |
| `TopReceiptItems` — ranked list, 10 rows, one column | Own wide card, same 10 rows laid out as two columns of 5 | A phone scrolls a list of 10; a wide window can show all 10 without scrolling further |
| Export Report button (full-width, bottom of page) | Small secondary button in the persistent control row, same destination + params | Promoted next to the period controls it exports, instead of requiring a scroll to the very bottom to find it |

## Layout

### Chart width: `useContentWidth()` does not apply here, and one chart must stop using it

`useContentWidth()` returns one number for the whole window, capped at
`CONTENT_MAX_WIDTH` (1080, minus padding). That is the right tool for a
screen that is genuinely one column wide, because "the chart's width" and
"the window's width" are the same question. The moment this screen has a
double-width primary card next to a single-width secondary one, and a
two-up chart row, "the window's width" and "this chart's width" are no
longer the same number, and the hook becomes actively wrong — it would
either overflow a narrow grid cell or under-fill a wide one, at a size that
has nothing to do with the box it's actually sitting in.

Of the charts this screen uses, only one currently calls the hook:
`InteractiveBarChart` (`SpendingTrendChart`'s bar chart) reads
`useContentWidth()` directly inside itself, ignoring whatever width its
parent card actually rendered at. `InteractiveDonutChart` and `WeekdayChart`
already take an explicit `size`/render at their container's width and need
no change. So the one concrete requirement this layout imposes: the bar
chart must measure its own container instead, the same way
`InteractiveLineChart` already does (`onLayout` → local `chartWidth` state)
— that pattern already exists in this codebase for exactly this reason; this
is applying it to a second chart, not inventing it. `useContentWidth()`
remains correct and unchanged for every other screen still single-column
(Home, Budgets, Chat) — this is scoped to the one chart Analytics itself
renders.

**The page container carries no width cap.** `ExpensesDesktop`'s content area
has none either (`mainColumn: { flex: 1, minWidth: 0 }`) — the content area
spans the window (Universal rule). A multi-column breakdown grid benefits
from the real width; capping it back down to 1080 would recreate the exact
"narrow column, empty gutters" problem this redesign exists to fix. There is
no hard ceiling on very wide monitors either, matching that same precedent —
flagged under Open Questions, since nobody has looked at either screen past
roughly 1440–1600px.

### Control row: what's fixed, what scrolls

The reference screen splits this two ways: the search box and the two
action buttons sit in a `topBar` outside the one `ScrollView`; the facet rail
(which includes the period facet) sits *inside* it, and scrolls away with
the table. Read literally, that would put Analytics' period controls inside
the scroll too. But the rail's job is "set once, then read many rows below
it" — the *search box*, a simple standalone control with no grouping or
counts, is what stayed fixed. Analytics' period/currency controls are the
same shape as the search box (compact, standalone, not a multi-group rail),
and are read far more often mid-session than the rail's own facets are
(flipping through several months in a row is a normal thing to do here). So
they follow the search box's precedent, not the rail's: **fixed**, in one
control row alongside Export, above the one scroll area. This is an
interpretation of a genuinely mixed precedent, not a rule — stated
explicitly rather than left to look accidental.

### Wireframe, ≥1440px

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ WebTopBar: AI Budget · Dashboard Expenses Budgets Analytics AI Chat  [acct][$][🔔][⚙] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [Week][Month][Year]   ◀ August 2026 ▶        [Currency: All ▾]          [⬇ Export]    │
├──────────────────────────────────────────────────────────────────────────────────────┤ ┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                  │ │ Summary
│ │ Total Spent  │ │ Avg / day    │ │ Transactions │ │ Top Category │                  │ │ Strip
│ │ 2 340 zł ↓12%│ │ 78 zł        │ │ 46           │ │ ● Groceries  │                  │ │ (1 row,
│ │ ±4% vs 3-mo  │ │              │ │              │ │   810 zł     │                  │ │  4 tiles)
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                  │ ┘
│                                                                                        │
│ ┌────────────────────────────────────────────┐ ┌───────────────────────────────────┐ │ ┐ Trend +
│ │ Spending trend               (flex 2)       │ │ By day of week         (flex 1)   │ │ │ weekday,
│ │  ▂▃▅▇▆▄▃▂▅▇█▆▃▂▄▅▆▇█▆▅▄▃▂▁▂▃▅▆               │ │  M T W T F S S                    │ │ │ side by
│ │  tap a bar to explore →                     │ │  Sat is your peak spending day    │ │ │ side
│ └────────────────────────────────────────────┘ └───────────────────────────────────┘ │ ┘
│                                                                                        │
│ ┌──────────────────────────────────────────┐ ┌────────────────────────────────────┐  │ ┐
│ │ ◔ By category                  (primary)  │ │ ◔ By merchant                      │  │ │ Breakdown
│ │   spans 2 of 3 tracks, full list, chips    │ │   1 of 3 tracks, top 5 + show all  │  │ │ grid row 1
│ └──────────────────────────────────────────┘ └────────────────────────────────────┘  │ ┘ (3 tracks)
│ ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐                    │ ┐
│ │ ◔ By tag           │ │ ◔ By project       │ │ ◔ Income by cat.   │                    │ │ row 2,
│ │ (conditional)      │ │ (conditional)      │ │ (conditional)      │                    │ │ 1 track
│ └───────────────────┘ └───────────────────┘ └───────────────────┘                    │ ┘ each
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────┐   │ ┐ Top items
│ │ Top items — 2 columns of 5, ranked 1–10                                        │   │ ┘ (own card)
│ └────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                        │
│ ┌───────────────────────────────────┐ ┌──────────────────────────────────────────┐   │ ┐ Insights
│ │ ✨/🔒 AI insight or Upgrade tile   │ │ ⚠ Prediction / anomaly tile               │  │ │ cluster
│ │ 💡 Daily budget tip                │ │ 🏷 Discount savings                       │  │ │ (2-up
│ └───────────────────────────────────┘ └──────────────────────────────────────────┘   │ ┘ masonry)
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────┐   │ ┐ Inflation
│ │ Personal Inflation Index    [3m][6m][12m][all]                                 │   │ │ Index
│ │ +6.2% · 14 tracked      │  product list, top 3 + show all │  Manage products →  │  │ │ (own wide
│ │  products                │                                  │  Plan a shop →     │  │ │ card,
│ │                          │                                  │  Community Map →   │  │ │ 3-across)
│ └────────────────────────────────────────────────────────────────────────────────┘   │ ┘
│                                                                                        │
│ ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐                    │ ┐ Discovery,
│ │ 📖 Spending Story  │ │ 🎁 Financial       │ │ 🧪 Scenario         │                   │ │ bottom-
│ │                    │ │    Wrapped         │ │    Simulator        │                   │ │ tier
│ └───────────────────┘ └───────────────────┘ └───────────────────┘                    │ ┘
└──────────────────────────────────────────────────────────────────────────────────────┘
          one page scroll, from the Summary Strip down to the discovery row
```

### What changes at 1024–1439

Not everything, and not nothing. Concretely, by cluster:

- **Summary Strip, Trend+Weekday row, Top Items, Insights cluster, Inflation
  Index, discovery row: unchanged in structure.** Each was sized against
  1024, not 1440 — a 4-tile strip, a 2-up chart pair, a 2-up masonry, and a
  3-up discovery row all still have comfortable room at 1024 (a 2-up card at
  1024 is already wider than that same card ever gets on a phone). Only
  gutters and outer padding shrink slightly.
- **The breakdown grid is the one thing that genuinely reflows**, because its
  math is track-based: 3 tracks at ≥1440 (Category spans 2, Merchant fills
  the 3rd; Tag/Project/Income share a second row of 3), 2 tracks at
  1024–1439. Category's 2-of-3 span becomes 2-of-2 — full width, alone on
  its own row, same as it would render on a phone but at a much larger size
  — and the four secondary breakdowns pair up two-per-row instead of three,
  wrapping to two rows instead of one. This is a real, testable difference,
  not a cosmetic one, and it's driven by percentage track widths
  (`flexBasis`), not a hand-picked pixel breakpoint, so it degrades
  gracefully rather than snapping.

### The breakdown grid should be one generic card, not five

`CategoryBreakdown`, `MerchantBreakdown`, `TagBreakdown`,
`ProjectBreakdown`, and `IncomeCategoryBreakdown` are, on inspection, the
same component five times over: a donut, a coloured-dot row, an amount, a
percentage. `ProjectBreakdown` adds an optional budget bar per row;
`CategoryBreakdown` adds an optional vsAverage chip per row. Building five
new desktop-specific wrappers to match would just add a second layer of the
same duplication mobile already carries. A single desktop-only
`BreakdownCard` (name illustrative) — title, a normalised `rows[]`
(id/name/amount/percentage/color, plus the two optional per-row extras),
`primary`/`secondary` size, chart size — driven by five thin adapters over
the existing `CategorySpending`/`MerchantSpending`/`TagSpending`/
`ProjectSpending`/`IncomeCategorySpending` shapes covers all five, the same
way `ExpensesDesktop`'s single `LedgerRow` covers both expenses and income.
**This is new, desktop-only code — it does not touch or replace the five
mobile components**, which stay exactly as they are (mobile's own
duplication is inherited, per the reference screen's locked decision to keep
mobile untouched; the desktop layer is free to be smarter internally, since
none of it exists yet).

### Personal Inflation Index — reflowed, not rebuilt

Same headline (%), same found-total line, same product list (top 3 + "show
more"), same three links (manage products / plan a shop / community map),
same period chips. Only the arrangement changes: today's vertical mobile
stack becomes three columns inside one wide card — headline block, product
list, links rail — because nothing here needs to be narrow once there's
width to spend. The product-detail view (tap a product → rename + price
history + cheapest-store compare) is currently built as inline JSX with a
bottom-sheet `Modal`, not as its own component — before it can become a
centred dialog on desktop (Universal rule), it needs to be pulled out into
its own component first, the same reason an `app/`-only screen would need to
move to `src/` before a dialog could host it. This is a small, contained
extraction (roughly 150 lines), not a rewrite.

### How a gated section should read

`AiInsightsSection`'s locked state today is a centred, `alignItems: 'center'`
card — fine as the one thing on a phone screen, but dropped into a 2-up
masonry of otherwise left-aligned icon+title+description tiles, a centred
blank-feeling block reads as broken, not as "you don't have this yet." It
should take the *same* shape as every other insight tile in that cluster —
icon, one-line title, one-line subtitle, a small inline "Upgrade" chip at
the end of the row, sized identically to its neighbours — so a locked
feature presents as one more tile you don't have, not as a jarring gap in
an otherwise uniform grid.

## States

**Loading.** Native and narrow web already paint instantly from the local
SQLite cache (`hydrateTransactions`'s local-first read) — nothing to design
here. **Desktop web has no SQLite mirror**, so the first load of a session
has genuinely empty stores until the API pull resolves, and neither
`useAnalytics` nor this screen currently reads any hydration flag — the risk
is a flash of the empty state (below) before real numbers land, which is
strictly a desktop-web-only risk (native never has empty stores at rest).
The fix is cheap and doesn't require new mechanism: `useHydrationStore`
already exists and already drives `HydrationProgressBar`
(`(tabs)/_layout.tsx`, unaffected by the desktop header-hiding logic since
it's a sibling of the tab navigator, not the header). Gate the empty-state
banner on `!isHydrating` so a page still loading shows a neutral state
rather than confidently declaring "no transactions."

**Empty** (zero transactions in the selected period — genuinely common on a
brand-new account, and the case the task brief specifically warns a wide
screen makes look worse). The persistent control row and the Summary Strip
stay visible (the strip shows zero/em-dash values honestly, same as the
reference screen's own tiles do for an empty filtered set). The Trend+Weekday
row, the breakdown grid, and Top Items collapse into **one** wide, centred
empty-state block — reusing `CategoryBreakdown`'s existing copy and icon
(`analytics.noData` / `analytics.addExpensesHint`), not three or four small
"no data" fragments scattered across an otherwise-empty grid, which is
exactly the "far worse on a wide screen" failure mode named in the brief.
The Insights cluster is **not** collapsed uniformly: the deterministic tiles
(daily-budget-tip, discount-savings, anomalies, predictions) are all
meaningless at zero data and are dropped, but the Pro-gated AI-insights
upsell tile, if the account is gated, **stays** — it is a feature-marketing
card independent of this period's data, and mobile already shows it
unconditionally; dropping it here would be exactly the kind of silent loss
this whole exercise is meant to catch. Personal Inflation Index and the
discovery row are untouched (neither is scoped to the selected analytics
period).

**Populated.** As designed above.

**Error.** This screen has no dedicated error UI today, on mobile or web —
failures degrade silently and per-section (AI insights hide, the anomaly
computation falls back to a local calculation, Inflation Index has its own
independent state elsewhere). This spec does not add a new error mechanism;
inventing one here would be disproportionate to what mobile does today. One
consequence worth naming rather than leaving implicit: a persistently
failing AI-insights fetch is visually indistinguishable from "no insights
yet" — both render nothing. Pre-existing, not new, and out of proportion to
fix as part of a layout spec.

## Interactions

**Hover.** Two genuine, justified uses, not decoration for its own sake:
(1) the Summary Strip's two clickable tiles and the trend chart's bars gain
`cursor: pointer` plus a hover tint on web — the only affordance a mouse
needs that a thumb doesn't, since the chevron icon already signals
tappability on mobile. (2) `InteractiveDonutChart` already tracks a
`focusedIndex` internally with an unused `onSectionPress` escape hatch;
bridging that outward lets hovering a donut slice highlight the matching row
in the breakdown card's list, and hovering a row highlight the matching
slice — new value the mouse affords, not present on mobile, and small to
build (a prop addition, not a new chart). Its **focusable twin**: Tab lands
the same highlight on a row (a real `Pressable`/focusable element, not a CSS
`:hover`-only trick) and holds it while focus remains there, so the
highlight state is reachable without a mouse. No other hover state is added
— a card that hovers without a real interaction behind it is a false
affordance, not an upgrade.

**Right-click.** None. Nothing on this screen is a row the user owns and can
act on (you cannot edit, delete, or duplicate "35% of this month's spend");
right-click has no natural target here, and forcing one in to match the
reference screen would invent an action with nothing behind it.

**Selection.** None — no rows, no checkboxes, no bulk bar. Stated explicitly
so its absence reads as a decision, not an oversight.

**Keyboard.** Tab order follows reading order: control row → Summary Strip
tiles → trend chart bars → breakdown-grid rows → Top Items → Insights tiles
→ Inflation Index links → discovery row. The currency dropdown is a
standard button-opens-menu pattern — Tab to focus, Enter/Space to open,
arrow keys between options, Enter to choose, Escape to close.

**Dialogs.** Exactly one on this screen: the Inflation Index product-detail
view, moved from a bottom sheet to a centred dialog per the Universal rule
(see Layout). No detail/create dialog otherwise — this screen creates
nothing and has no entities to view the detail of.

## Departures from the design language

**Totals may blend currencies via FX conversion, unlike the ledger.** The
reference screen's "totals are per-currency and never blended" rule is
explicitly filed under List-specific ("proven on the ledger... a screen
without rows should not inherit it by analogy"), so it does not bind here by
default — but it's worth stating plainly rather than leaving it to be
noticed later: Analytics' Summary Strip and breakdown totals already convert
and blend currencies (`toDisplayCurrency`) whenever "All currencies" is
selected, and this spec keeps that unchanged. This is existing mobile
behaviour, not something introduced by this redesign, and not something this
layout spec is positioned to relitigate — a genuine change to Analytics' FX
semantics would be a data-layer decision, separate from screen layout.

**Persistent control row vs. the rail's own precedent.** Addressed in
Layout ("Control row: what's fixed, what scrolls") — flagged here too since
it is an interpretation of a genuinely mixed precedent (the reference
screen's search box is fixed; its facet rail, which includes the period
facet, is not), not a directly-stated rule either way.

No other departures. The horizontal currency-pill row is a compliance fix,
not a departure — it was already violating the "no horizontal row of filter
pills" rule before this spec; this spec corrects it rather than diverging
further from it.

## Open questions

- **Whether the donut↔row hover cross-highlight is worth building for v1**, or
  whether shipping only the cursor/hover-tint on already-clickable elements
  is enough and the cross-highlight can follow later. A judgement call on
  cost vs. payoff that only the product owner can make, not something the
  repo answers.
- **Whether the 3-track breakdown grid actually reads well in the middle of
  the 1024–1439 band** (around 1280px) rather than only at its two ends —
  the language doc itself calls this band "unproven" for the reference
  screen, and nothing here changes that; only a deployed screen can say.
- **Whether an outer max-width ceiling belongs on ultra-wide monitors**
  (>1800px roughly). This spec adds none, matching the reference screen's
  own precedent, but nobody has looked at either screen on a display that
  wide yet.
- **Whether merging Quick Insights and AI Insights into one cluster reads as
  one coherent section**, or as an odd mix of "always free" and "sometimes
  locked" tiles sitting side by side. A content-hierarchy question for the
  product owner's eye, not decidable from the code.
- **Whether dropping the "topCategory"/"highestSpendingDay" sentence cards
  loses something some users specifically valued** — being told the answer
  in words, not just shown a number a click away. Worth confirming against
  real usage, once ABA-497's telemetry has anything to say (it doesn't yet).
- **Whether the Inflation Index's three-column reflow holds up with real
  data** — long product names, long store lists, more than 3 tracked
  products — rather than the short illustrative example in this spec's
  wireframe.
- **Light theme and both width regimes, on the deployed screen.** Same
  caveat as the reference screen: checked by eye once shipped, not before —
  nothing in this repo renders a component in CI.
