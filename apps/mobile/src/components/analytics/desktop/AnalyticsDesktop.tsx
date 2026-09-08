import { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useHydrationStore } from '@/stores/hydrateTransactions';
import { InflationIndexSection } from '@/components/analytics';
import { DrillDownDialog } from './DrillDownDialog';
import { StoryDialog } from './StoryDialog';
import { FACET_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
import { useAnalyticsScreenData } from '@/features/analytics/useAnalyticsScreenData';
import { ControlRow } from './ControlRow';
import { AnalyticsSummaryStrip } from './AnalyticsSummaryStrip';
import { TrendAndWeekdayRow } from './TrendAndWeekdayRow';
import { BreakdownGrid } from './BreakdownGrid';
import { TopItemsCard } from './TopItemsCard';
import { InsightsCluster } from './InsightsCluster';
import { DiscoveryRow } from './DiscoveryRow';

/**
 * Desktop Analytics screen (ABA-501). Follows
 * `docs/design/2026-09-05-analytics-web.md`'s wireframe: a fixed control row
 * (period + currency + export — this screen has no facet rail, nothing here
 * is a row) above ONE page scroll holding a 4-tile summary strip, a trend+
 * weekday row, a breakdown grid, top items, a merged insights cluster, the
 * Personal Inflation Index, and a bottom discovery row.
 *
 * Reuses `useAnalyticsScreenData()` (Task 1) — every number here is computed
 * exactly where it already was; this file only decides where each number is
 * PRINTED. Three mobile blocks are dropped on desktop only, per the design's
 * "Where two blocks answer the same question" — `QuickInsights`' topCategory
 * sentence card (folded into a 4th summary-strip tile instead), its
 * highestSpendingDay sentence card (the trend chart already shows the same
 * date), and its Anomalies list (the per-category vsAverage chip in the
 * breakdown grid already shows the same signal). `AnalyticsMobile.tsx` is
 * untouched — this file duplicates LAYOUT, never behaviour.
 *
 * `InflationIndexSection` is passed `desktop` (ABA-501 Task 5): it reflows its
 * own headline / product-list / links-rail into three columns internally
 * (design's "Personal Inflation Index — reflowed, not rebuilt") and hosts its
 * per-product detail as a centred dialog instead of a bottom sheet (design's
 * Universal dialogs rule). `AnalyticsMobile.tsx`'s own call site passes no
 * prop and is unaffected.
 *
 * **Two of the screen's four outbound navigations are dialogs, not pushes
 * (Task 7)**: the Spending Trend drill-down (`DrillDownDialog`, opened from
 * the two clickable summary tiles and the trend chart's bars) and the
 * Spending Story (`StoryDialog`, opened from the discovery row) both host a
 * component extracted from their route unchanged — `DrillDownView`/
 * `SpendingStoryView` — so mobile (which still navigates, via `openDrillDown`
 * and the discovery row's own `router.push('/story', ...)` on
 * `AnalyticsMobile`) and desktop share exactly one definition of each. The
 * other two — Scenario Simulator and Wrapped — deliberately stay
 * navigations: the former is a whole workspace with its own saved state and
 * sharing, the latter a full-screen swipeable card deck; neither fits a
 * centred dialog.
 *
 * Deliberately NOT done here, and why:
 * - The donut↔row hover cross-highlight (Interactions, "Open questions") and
 *   the currency dropdown's arrow-key-between-options behaviour are both
 *   named as open/optional in the spec — skipped for v1, not forgotten.
 *
 * `ControlRow` (+ `CurrencyDropdown`), `AnalyticsSummaryStrip` (+
 * `SummaryTile`), `TrendAndWeekdayRow`, `BreakdownGrid` (+ its `*ToRows`
 * mappers), `TopItemsCard`, `InsightsCluster`, and `DiscoveryRow` each live in
 * their own file in this directory, mirroring the `home/widgets/*`
 * extraction pattern — this file is a thin composition root that owns only
 * the two dialog-open booleans and the empty/loading-period branching. A new
 * desktop-analytics section should get its own file here, not another
 * inline component in this one.
 */
export function AnalyticsDesktop() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const isWideGrid = width >= FACET_RAIL_MIN_WIDTH;
  const isHydrating = useHydrationStore((s) => s.isHydrating);

  const {
    selectedRange,
    setSelectedRange,
    selectedCurrency,
    setSelectedCurrency,
    selectedMonth,
    selectedYear,
    isCurrentPeriod,
    getPeriodLabel,
    goToPrevPeriod,
    goToNextPeriod,
    resetToCurrentPeriod,
    availableCurrencies,
    currency,
    dailySpending,
    categorySpending,
    merchantSpending,
    incomeByCategory,
    summary,
    itemBreakdown,
    dayOfWeekSpending,
    periodComparison,
    predictions,
    tagSpending,
    projectSpending,
    aiInsights,
    aiInsightsProGated,
    drillDownParams,
  } = useAnalyticsScreenData();

  // Task 7: both dialogs are a single boolean/optional slot, mirroring
  // `ExpensesDesktop`'s `selectedRowId`/`createKind` state — only one of
  // either is ever open at a time, and both close via the same `onClose`
  // shape every desktop dialog in this app uses.
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);

  // "Zero transactions in the selected period" (design's Empty state) means
  // BOTH streams are empty, not just expenses — an income-only period must
  // NOT collapse the grid, since `IncomeCategoryBreakdown`'s own tile still
  // has something to show; that narrower "this one breakdown has nothing"
  // case is already handled per-card by `BreakdownCard`'s own empty state
  // (see its own doc comment). `categorySpending`/`incomeByCategory` are both
  // `[]` exactly when their respective total is zero (see
  // `useCategoryAnalytics`/`useIncomeAnalytics`), so this is an exact signal,
  // not an approximation.
  const isEmptyPeriod = categorySpending.length === 0 && incomeByCategory.length === 0;

  return (
    <View style={styles.root}>
      <ControlRow
        selectedRange={selectedRange}
        onRangeChange={(range) => {
          setSelectedRange(range);
          if (range === 'week') resetToCurrentPeriod();
        }}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        isCurrentPeriod={isCurrentPeriod}
        getPeriodLabel={getPeriodLabel}
        goToPrevPeriod={goToPrevPeriod}
        goToNextPeriod={goToNextPeriod}
        selectedCurrency={selectedCurrency}
        onCurrencyChange={setSelectedCurrency}
        availableCurrencies={availableCurrencies}
        onExport={() =>
          router.push({
            pathname: '/reports',
            params: { range: selectedRange, month: String(selectedMonth), year: String(selectedYear) },
          })
        }
      />

      {/* ONE page scroll — the control row above is the only fixed element,
          matching the reference screen's own search-box precedent (see the
          design's "Control row: what's fixed, what scrolls"). */}
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent}>
        <View style={styles.body}>
          <AnalyticsSummaryStrip
            summary={summary}
            periodComparison={periodComparison}
            selectedRange={selectedRange}
            currency={currency}
            topCategory={categorySpending[0] ?? null}
            onPress={() => setDrillDownOpen(true)}
          />

          {isHydrating ? (
            // Desktop web has no SQLite mirror (see the design's "Loading"
            // state) — the first load of a session has genuinely empty
            // stores until the API pull resolves. A neutral spinner here
            // avoids flashing "no transactions" before real numbers land.
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : isEmptyPeriod ? (
            <View style={styles.emptyBlock}>
              <Ionicons name="pie-chart-outline" size={64} color={theme.colors.textDisabled} />
              <Text style={styles.emptyBlockText}>{t('analytics.noData')}</Text>
              <Text style={styles.emptyBlockSubtext}>{t('analytics.addExpensesHint')}</Text>
            </View>
          ) : (
            <>
              <TrendAndWeekdayRow
                dailySpending={dailySpending}
                selectedRange={selectedRange}
                onBarPress={() => setDrillDownOpen(true)}
                dayOfWeekSpending={dayOfWeekSpending}
              />

              <BreakdownGrid
                isWideGrid={isWideGrid}
                currency={currency}
                categorySpending={categorySpending}
                merchantSpending={merchantSpending}
                tagSpending={tagSpending}
                projectSpending={projectSpending}
                incomeByCategory={incomeByCategory}
              />

              {itemBreakdown.length > 0 && <TopItemsCard itemBreakdown={itemBreakdown} currency={currency} />}
            </>
          )}

          <InsightsCluster
            summary={summary}
            predictions={predictions}
            selectedRange={selectedRange}
            currency={currency}
            aiInsights={aiInsights}
            aiInsightsProGated={aiInsightsProGated}
            suppressDeterministicTiles={isEmptyPeriod}
          />

          {/* `desktop` triggers its own internal reflow + dialog chrome —
              see the doc comment above. */}
          <View style={styles.wideSection}>
            <InflationIndexSection desktop />
          </View>

          <DiscoveryRow
            selectedYear={selectedYear}
            onOpenStory={() => setStoryOpen(true)}
          />
        </View>
      </ScrollView>

      {drillDownOpen && (
        <DrillDownDialog params={drillDownParams} onClose={() => setDrillDownOpen(false)} />
      )}

      {storyOpen && (
        <StoryDialog
          initial={{ month: String(selectedMonth), year: String(selectedYear) }}
          onClose={() => setStoryOpen(false)}
        />
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    // Must paint its own ground — see `ExpensesDesktop`'s identical comment;
    // a transparent tree shows React Navigation's light default through it.
    backgroundColor: theme.colors.background,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    flexGrow: 1,
  },
  body: {
    padding: theme.spacing[5],
    paddingBottom: theme.spacing[8],
    gap: theme.spacing[5],
  },
  loadingBlock: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[16],
  },
  emptyBlock: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[16],
    ...theme.shadows.sm,
  },
  emptyBlockText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
  },
  emptyBlockSubtext: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  wideSection: {
    // Plain pass-through — `InflationIndexSection` already paints its own
    // header + card; no extra chrome needed around it here.
  },
});
