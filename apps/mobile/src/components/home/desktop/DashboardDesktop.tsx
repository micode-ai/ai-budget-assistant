import { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { useStyles, type Theme } from '@/theme';
import { NewBadgeModal } from '@/components/gamification/NewBadgeModal';
import { useHomeScreenData } from '@/hooks/useHomeScreenData';
import { useWebFirstRun } from '@/hooks/useWebFirstRun';
import { SafeToSpendSheet } from '@/components/home/SafeToSpendSheet';
import { SECOND_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
import { resolveSetupSteps, shouldShowSetupChecklist } from '@/features/onboarding/resolveSetupSteps';
import { useBudgetStore } from '@/stores/budgetStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useWalletStore } from '@/stores/walletStore';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { usePurchaseRequestStore } from '@/stores/purchaseRequestStore';
import { useUserSubscriptionStore } from '@/stores/userSubscriptionStore';
import { isPurchaseRequestAccount } from '@/features/dashboard/attentionEnrichment';
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
 *
 * **Three states, not one** (`useWebFirstRun`): a bounded loading state while
 * the transaction pulls are unanswered, the first-run state for a genuinely
 * new account, and the ordinary dashboard. Both columns take the same
 * `firstRunView` value, so they can never disagree about which one is being
 * drawn.
 *
 * **The two Phase B reads are issued here and nowhere else.** Everything else
 * on this screen reuses data the app already loads; the pending
 * purchase-request count and the subscription list are the only two extra GETs
 * the desktop dashboard makes, and they exist solely to fill two of the five
 * kinds in "Needs your attention". They live in this component rather than in
 * `useHomeScreenData` precisely because the phone shares that hook and must
 * not gain two requests it has no use for. Both are fire-and-forget: see the
 * effect below for why an attention list that never receives them is a correct
 * outcome and not a degraded one.
 */
export function DashboardDesktop() {
  const [safeToSpendSheetVisible, setSafeToSpendSheetVisible] = useState(false);
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const showSecondRail = width >= SECOND_RAIL_MIN_WIDTH;

  const { view: firstRunView, pullAnswered, skip: skipFirstRun } = useWebFirstRun();

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
    currentAccountId,
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

  // Checklist inputs. `expenses`/`incomes` are not on `useHomeScreenData`'s
  // return, so they are read here directly — the same two stores it already
  // subscribes to through `hydrateTransactions`.
  const expenseCount = useExpenseStore((s) => s.expenses.length);
  const incomeCount = useIncomeStore((s) => s.incomes.length);
  const budgets = useBudgetStore((s) => s.budgets);
  // The wallet's own "has the server answered" evidence, the twin of
  // `pullAnswered` for the third source the checklist reads from.
  const walletPullAt = useWalletStore((s) => s.lastPullAt);
  const checklistDismissed = useFirstRunStore((s) => s.checklistDismissed);
  const dismissChecklist = useFirstRunStore((s) => s.dismissChecklist);

  // ---- Phase B: the two extra reads --------------------------------------
  //
  // The only two things "Needs your attention" can show that the dashboard was
  // not already loading. They are issued HERE rather than in
  // `useHomeScreenData`, which the phone shares — this component is reached
  // only through `DashboardView.web.tsx` at desktop width, so mobile issues
  // neither request. `AttentionPanel` reads the results off these same two
  // stores, the way it already reads alerts, invitations and budgets.
  const loadPendingPurchaseRequests = usePurchaseRequestStore((s) => s.loadPendingCount);
  const loadSubscriptions = useUserSubscriptionStore((s) => s.loadSubscriptions);

  useEffect(() => {
    if (!currentAccountId) return;

    // Both reads are ENRICHMENT. Neither is awaited, neither gates a render,
    // and a list that never receives them is simply shorter — never an error,
    // never a placeholder row, never a spinner outliving the rest of the
    // screen. Both store loaders already swallow their own failure internally
    // (`purchaseRequestStore` silently, `userSubscriptionStore` into its own
    // `error` field, which nothing on this screen reads), so these handlers
    // are inert today by construction. They are here so that a loader which
    // later starts rethrowing degrades into the `inflationShieldStore`
    // precedent — one warning, screen carries on — instead of an unhandled
    // rejection on the one screen built to be worth staying on.
    void loadSubscriptions().catch((e) =>
      console.warn('[DashboardDesktop] loadSubscriptions failed', e),
    );

    // Non-personal accounts only. A personal account has no other members to
    // vote, so this asks a question whose answer is already known. The panel
    // applies the SAME predicate before showing the row — nothing zeroes
    // `pendingCount` on an account switch, so gating only the request would
    // leave a shared account's queue on screen after switching to a personal
    // one.
    if (isPurchaseRequestAccount(currentAccountType)) {
      void loadPendingPurchaseRequests().catch((e) =>
        console.warn('[DashboardDesktop] loadPendingCount failed', e),
      );
    }
  }, [currentAccountId, currentAccountType, loadSubscriptions, loadPendingPurchaseRequests]);

  // ANY active budget, not `monthlyBudgetSummary.budgetCount`, which filters
  // `period === 'monthly'`. The row says "Create Budget" and says nothing
  // about a period, so counting monthly-only left a user whose single budget
  // is weekly or yearly staring at an instruction they had already followed,
  // on a row they could never tick. This is the identical filter
  // `useFinancialHealthScore` applies for its own budget-adherence component
  // — the component this step exists to unblock — so the tick and the score
  // cannot disagree about what counts.
  const activeBudgetCount = useMemo(
    () => budgets.filter((b) => b.isActive && !b.isDeleted).length,
    [budgets],
  );

  const setupSteps = useMemo(
    () =>
      resolveSetupSteps({
        expenseCount,
        incomeCount,
        walletCurrencyCount: walletSummary.length,
        budgetCount: activeBudgetCount,
      }),
    [expenseCount, incomeCount, walletSummary.length, activeBudgetCount],
  );

  // The whole rule is `shouldShowSetupChecklist` — pure, so the five
  // conditions are pinned by tests rather than living as an `&&` chain in a
  // component nothing in this repo's CI renders.
  //
  // All three steps go in, never a pre-filtered list: `[].every(...)` is
  // `true`, so filtering the done ones out first would report a fresh account
  // as fully set up and hide the card exactly when it is most useful.
  //
  // Both pull flags are doing real work. After the wait bound elapses the view
  // becomes `'dashboard'` with the server possibly still silent, and a
  // checklist derived from counts nobody has confirmed would tell an
  // established, fully-configured user to add their first transaction — or,
  // via the wallet count, to set a balance they set months ago.
  const showChecklist = shouldShowSetupChecklist({
    isDashboardView: firstRunView === 'dashboard',
    canEdit,
    transactionPullAnswered: pullAnswered,
    walletPullAnswered: walletPullAt !== null,
    dismissed: checklistDismissed,
    steps: setupSteps,
  });

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
            <FocusColumn
              ctx={widgetCtx}
              onOpenSafeToSpend={() => setSafeToSpendSheetVisible(true)}
              firstRunView={firstRunView}
              onSkipFirstRun={skipFirstRun}
            />
          </View>
          {/* No sizing wrapper here (round 6) — `DashboardRail` renders its
              own 300px column(s) and owns their width entirely, whether one
              or two are shown. */}
          <DashboardRail
            ctx={widgetCtx}
            widgetOrder={widgetOrder}
            secondRailVisible={showSecondRail}
            firstRunView={firstRunView}
            setupSteps={setupSteps}
            showChecklist={showChecklist}
            onDismissChecklist={dismissChecklist}
          />
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
