import { useState } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { useStyles, type Theme } from '@/theme';
import { NewBadgeModal } from '@/components/gamification/NewBadgeModal';
import { useHomeScreenData } from '@/hooks/useHomeScreenData';
import { SafeToSpendSheet } from '@/components/home/SafeToSpendSheet';
import { SECOND_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
import type { HomeWidgetContext } from '@/components/home/HomeWidgetContext';
import { FocusColumn } from './FocusColumn';
import { DashboardRail } from './DashboardRail';

/**
 * Desktop web dashboard (`docs/design/2026-09-05-dashboard-web.md`). A fluid
 * focus column on the left (the "lead story" — Safe to Spend + Net Profit,
 * Income & Expenses, Monthly Budget, see `FocusColumn`) and a fixed-width
 * standing rail on the right (see `DashboardRail`), both inside ONE page
 * scroll — mirrors the reference/Analytics/Budgets screens' single-
 * `ScrollView` rule; no independent scroller per column. Reuses
 * `useHomeScreenData()` unchanged (read-only for this task) — every number
 * here is computed exactly where it already was.
 *
 * **Pull-to-refresh is dropped, with no substitute** — same precedent as
 * `ExpensesDesktop`/`BudgetsDesktop`, both of which drop `onRefresh` too.
 *
 * **Round 6 added a second rail column** at/above `SECOND_RAIL_MIN_WIDTH`
 * (`webLayout.constants.ts`) — `DashboardRail` now owns deciding and sizing
 * how many physical rail columns to render (see its own doc comment for the
 * row-major split); this component only computes and passes the boolean
 * that decides which regime applies, via the same `useWindowDimensions()`
 * pattern `ExpensesDesktop`/`AnalyticsDesktop` already use for their own
 * width-conditional regimes (`FACET_RAIL_MIN_WIDTH`/`isWideGrid`).
 *
 * **The orange hero and the quick-action strip are retired here.**
 * `WebTopBar` (mounted by `WebShell`, above this component in the tree)
 * already carries account/currency/alerts/settings; the rail's own fixed
 * quick-list (`DashboardRail`'s `RailQuickActions`) replaces the strip.
 * `HomeQuickActionStrip.tsx` itself is untouched — it simply isn't part of
 * this tree.
 */
export function DashboardDesktop() {
  const [safeToSpendSheetVisible, setSafeToSpendSheetVisible] = useState(false);
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const showSecondRail = width >= SECOND_RAIL_MIN_WIDTH;

  const {
    canEdit,
    currency,
    walletSummary,
    convertedIncomeTotal,
    convertedExpenseTotal,
    level,
    levelProgress,
    currentStreak,
    investmentSummary,
    lentDebts,
    borrowedDebts,
    convertedLentTotal,
    convertedBorrowedTotal,
    currentAccountType,
    widgetVisibility,
    widgetOrder,
    monthlyBudgetSummary,
    totalBudget,
    budgetUsedPercent,
    remaining,
    widgetRefreshKey,
    safeToSpendData,
    hasSafeToSpend,
    rates,
  } = useHomeScreenData();

  const widgetCtx: HomeWidgetContext = {
    widgetVisibility,
    monthlyBudgetSummary,
    remaining,
    totalBudget,
    budgetUsedPercent,
    convertedIncomeTotal,
    convertedExpenseTotal,
    currency,
    lentDebts,
    borrowedDebts,
    convertedLentTotal,
    convertedBorrowedTotal,
    widgetRefreshKey,
    walletSummary,
    canEdit,
    level,
    levelProgress,
    currentStreak,
    investmentSummary,
    currentAccountType,
    rates,
    safeToSpendData,
    hasSafeToSpend,
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.layout}>
          <View style={styles.focusColumn}>
            <FocusColumn ctx={widgetCtx} onOpenSafeToSpend={() => setSafeToSpendSheetVisible(true)} />
          </View>
          {/* No sizing wrapper here (round 6) — `DashboardRail` renders its
              own 300px column(s) and owns their width entirely, whether one
              or two are shown. */}
          <DashboardRail ctx={widgetCtx} widgetOrder={widgetOrder} secondRailVisible={showSecondRail} />
        </View>
      </ScrollView>

      {/* Safe-to-Spend breakdown — a centred dialog on desktop (`desktop`
          prop), not the mobile bottom sheet. */}
      <SafeToSpendSheet
        visible={safeToSpendSheetVisible}
        onClose={() => setSafeToSpendSheetVisible(false)}
        data={safeToSpendData}
        desktop
      />
      <NewBadgeModal />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    // Must paint its own ground — a transparent tree shows React
    // Navigation's light default through it (see `ExpensesDesktop`'s
    // identical comment; this shipped once already and was invisible to
    // types, tests and three reviews).
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[5],
    paddingBottom: theme.spacing[8],
  },
  layout: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[5],
  },
  // Fluid — fills whatever the rail leaves behind. `minWidth: 0` stops a
  // wide-content child (the net-profit chart) from forcing this flex item
  // past its measured width, a standard RN-web flex-row gotcha.
  focusColumn: {
    flex: 1,
    minWidth: 0,
  },
});
