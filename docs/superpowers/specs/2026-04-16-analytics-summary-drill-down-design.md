# Analytics Summary Drill-Down — Design

**Date:** 2026-04-16
**Status:** Approved by user (brainstorming phase)
**Scope:** Mobile app (`apps/mobile`) only. No API, shared-types, or DB schema changes.

## Problem

On `apps/mobile/app/(tabs)/analytics.tsx`, the two summary cards at the top of the
screen — "Total spent" (`summary.totalSpent`) and "Average per day"
(`summary.averagePerDay`) — are informational `<View>`s with no tap affordance.

The existing `InteractiveBarChart` lower on the same screen already routes to
`/analytics/drill-down` with a well-defined params contract
(`startDate`, `endDate`, `currencyCode`, `level`). The drill-down screen
(`apps/mobile/app/analytics/drill-down.tsx`) and the `useDrillDown` hook already
produce the exact list of transactions for that period — the wiring is all
there, the two summary cards simply don't consume it.

User feedback: they expect tapping the top widgets to open the underlying list
of expenses.

## Goal

Make both summary cards tappable. Tap routes to `/analytics/drill-down` with
the same params the bar chart uses today, preserving the currently-selected
time range and currency filter.

## Non-goals

- No changes to `drill-down.tsx` or `useDrillDown`.
- No new endpoints, no Prisma changes, no shared-types changes.
- No inline accordion expansion on the analytics screen itself.
- No differentiated behaviour between the two cards — both open the same
  drill-down with identical params. A single invariant: "tap a top widget,
  see the expenses behind it."
- No drill-down entry from any other existing widget (AI insights, tag chart,
  project chart, insight cards at the bottom, etc.) — out of scope.

## User flow

1. User lands on `/analytics`.
2. The two summary cards each show a small `chevron-forward` icon
   (Ionicons, size 14, `theme.colors.textTertiary`) at the top-right corner as
   a visual affordance.
3. User taps either card. `router.push` fires with:
   ```ts
   {
     pathname: '/analytics/drill-down',
     params: {
       startDate: dateRange.startDate.toISOString(),
       endDate: dateRange.endDate.toISOString(),
       currencyCode: currency,
       level: selectedRange === 'year' ? 'year' : 'month',
     },
   }
   ```
   — identical to the `onBarPress` handler on `InteractiveBarChart` at
   `analytics.tsx:327-337`.
4. The existing drill-down screen handles the rest. If the period has zero
   transactions, drill-down shows its own empty state — unchanged.

### Currency behaviour

The `currency` local variable on the analytics screen is
`selectedCurrency || user?.currencyCode || 'USD'` (`analytics.tsx:107`). The
same value already feeds the bar chart, so the summary cards use the same
value without additional logic.

### Screen-reader / accessibility

- Each card carries `accessibilityRole="button"` and
  `accessibilityLabel={t('analytics.viewExpenses')}`.
- The decorative chevron icon inside is marked `accessible={false}` so it
  doesn't add noise to the button's announced label.

## Implementation outline

**Files touched (mobile only):**

1. `apps/mobile/app/(tabs)/analytics.tsx`
   - Extract a local handler:
     ```tsx
     const openDrillDown = useCallback(() => {
       router.push({
         pathname: '/analytics/drill-down',
         params: {
           startDate: dateRange.startDate.toISOString(),
           endDate: dateRange.endDate.toISOString(),
           currencyCode: currency,
           level: selectedRange === 'year' ? 'year' : 'month',
         },
       });
     }, [dateRange.startDate, dateRange.endDate, currency, selectedRange]);
     ```
     Reuse from both cards AND refactor the existing bar-chart `onBarPress` to
     call it (DRY — currently the params logic is inlined twice if we don't).
   - Replace each `<View style={styles.summaryCard}>` with
     `<TouchableOpacity style={styles.summaryCard} onPress={openDrillDown}
     activeOpacity={0.7} accessibilityRole="button"
     accessibilityLabel={t('analytics.viewExpenses')}>`, closing with
     `</TouchableOpacity>`.
   - Add a chevron icon absolutely positioned (or via flex header row) in each
     card. A lightweight header row is cleaner than absolute positioning; add
     a small `summaryCardHeader` style with
     `flexDirection: 'row', justifyContent: 'space-between'` wrapping the
     existing `summaryLabel` Text and a new chevron Ionicons element.
   - Add styles: `summaryCardHeader` (or equivalent), `summaryCardChevron`
     (opacity 0.6). No other style churn.
2. `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts`
   - Add `analytics.viewExpenses` — a short phrase used only as a screen-reader
     label. English source: "View expenses". Translations for the other 7
     locales agreed during brainstorming and listed in the plan.

**No changes to:**
- `apps/mobile/app/analytics/drill-down.tsx`
- `apps/mobile/src/features/analytics/useDrillDown.ts`
- `apps/mobile/src/features/analytics/useAnalytics.ts`
- Any other screen or store.

## Manual test plan

- [ ] Tap "Total spent" card on analytics → drill-down opens for the current
      period, shows the same breadcrumb/chart/transaction list as tapping the
      bar chart does.
- [ ] Tap "Avg per day" card → identical drill-down opens.
- [ ] Change range selector to `week` / `month` / `year`; cards remain
      tappable and drill-down reflects the selected range.
- [ ] Change month via `<`/`>` picker; cards open drill-down for the newly
      selected period.
- [ ] Toggle currency filter; drill-down opens with the filtered currency.
- [ ] With no transactions in the period, tapping a card opens drill-down and
      shows the existing empty state — no crash.
- [ ] Chevron icons visually match the existing `theme.colors.textTertiary`
      tone and don't feel visually loud.
- [ ] VoiceOver/TalkBack announces "View expenses, button" per card; chevron
      icon is not announced.
- [ ] Bar chart drill-down still works (regression check for the refactor of
      `onBarPress`).

## Risks / open questions

- **Shared handler vs. duplicated inline handlers.** The refactor of the bar
  chart's inline `onBarPress` to call `openDrillDown` is a minor DRY
  improvement that touches code outside the strict scope of this feature. It
  is included because keeping the params logic in two places would invite
  drift. If the reviewer flags this as scope creep, the fallback is to keep
  bar-chart's handler inline.
- **A11y label wording.** "View expenses" is terse; some locales may prefer
  a verb phrase ("Show expenses") or a noun phrase ("Expenses list"). Exact
  strings in each locale are pinned in the implementation plan.
- **Affordance choice.** Chevron-forward was chosen over a text hint
  ("Tap to explore") because the bar chart below already uses a text hint;
  two hints stacked would be visually noisy. If users find the chevron too
  subtle in field testing, a follow-up can add a hint — out of scope here.
