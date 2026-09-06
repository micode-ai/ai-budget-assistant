import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { NetProfitWidget } from '@/components/widgets';
import { IncomeExpensesCard } from '@/components/home/widgets/IncomeExpensesCard';
import { MonthlyBudgetCard } from '@/components/home/widgets/MonthlyBudgetCard';
import { WalletsSection } from '@/components/home/widgets/WalletsSection';
import { useBudgetStore } from '@/stores/budgetStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { resolveMonthlyBudgetSegments } from '@/features/dashboard/monthlyBudgetSegments';
import type { FirstRunView } from '@/features/onboarding/webFirstRunView';
import type { HomeWidgetContext } from '@/components/home/HomeWidgetContext';
import { FirstRunPanel } from './FirstRunPanel';

interface FocusColumnProps {
  ctx: HomeWidgetContext;
  onOpenSafeToSpend: () => void;
  /**
   * Which of the three dashboard states to draw. `'dashboard'` is the whole
   * of this component's pre-existing behaviour, unchanged; the other two
   * replace the five slots entirely.
   *
   * Required rather than optional, and deliberately so: `DashboardDesktop` is
   * the only caller, and a default would let a future second caller silently
   * opt out of the state machine.
   */
  firstRunView: FirstRunView;
  /** Passed through to `FirstRunPanel`'s skip link. */
  onSkipFirstRun: () => void;
}

/**
 * Desktop web's fixed FIVE-slot "lead story" (`docs/design/2026-09-05-
 * dashboard-web.md`'s "The focus column", originally three; round 4 added
 * nothing here, round 6 added `wallets` as a fifth slot) — hero
 * (Safe-to-Spend + Net Profit), Income & Expenses, Monthly Budget, Wallet
 * Balances, top to bottom, in that FIXED order regardless of `widgetOrder`
 * (see the design's "A consequence worth stating outright" — only
 * visibility, not position, is user-driven for these five keys on desktop;
 * round 6 is the SAME rule extended to a fifth key, not a new one — the
 * cost is now five keys ignore the user's stored order instead of four).
 * `wallets` moved here from the rail because at the rail's fixed ~300px its
 * currency chips scrolled horizontally out of view — the focus column is
 * wide enough that they fit without a scroller. This is ordinary
 * top-to-bottom flow, not a promotion algorithm: there is no code that
 * decides "since the hero is hidden, promote X into its place" — whatever
 * slot is next in this fixed template simply becomes the first thing shown.
 *
 * Each slot is independently visible only when its backing widget(s) are
 * visible AND have something to show (`wallets` always has something to
 * show — `WalletsSection` renders its own empty state when there are no
 * balances, the same "has something to show" gate `renderHomeWidget`'s
 * `'wallets'` case already uses for the rail, unchanged here). When all
 * five collapse, this renders one centred empty state instead of a blank
 * column beside a populated rail — "the one genuinely new empty state this
 * spec adds" per the design, because a blank focus column is the worst
 * failure this layout has (it's the first thing shown after signing in).
 */
export function FocusColumn({
  ctx,
  onOpenSafeToSpend,
  firstRunView,
  onSkipFirstRun,
}: FocusColumnProps) {
  const { widgetVisibility, monthlyBudgetSummary, safeToSpendData, hasSafeToSpend, widgetRefreshKey } = ctx;

  const { budgets, getBudgetProgress } = useBudgetStore();
  // `budgetStore.getBudgetProgress` internally reads `useExpenseStore`'s
  // expenses AND `useCategoryStore`'s categories via a plain `.getState()`
  // snapshot - not a subscription - so it can silently answer with whichever
  // of the two happened to have loaded yet, without telling this caller.
  // `budgets`/`getBudgetProgress` alone are therefore NOT a sufficient memo
  // dependency list: once `budgets` first settles, this memo freezes at
  // whatever expenses/categories state existed at that instant and never
  // recomputes again - not on later loads, and not on a later edit (e.g. a
  // new expense added while the dashboard stays open). This was a real,
  // reproduced bug, not a hypothetical one: the dashboard is the first
  // screen mounted after sign-in, and `budgets` routinely settles before
  // expenses/categories do, freezing the segmented bar at 0% with every
  // category name unresolved ("Unknown"). `BudgetsDesktop`'s own analogous
  // computation escapes this only by accident - its `visibleBudgets` is a
  // fresh, unmemoized `.filter()` result on every render, so it recomputes
  // on every re-render regardless of any dependency list, not because it
  // is reactive on purpose. Subscribing to both stores here (rather than
  // copying that accident) is the deliberate fix.
  const expenses = useExpenseStore((s) => s.expenses);
  const categories = useCategoryStore((s) => s.categories);
  // The lint rule's static analysis can't see that `getBudgetProgress`
  // reads `expenses`/`categories` internally (it only sees the two
  // identifiers it's actually called with) and flags them as "unnecessary"
  // - they are the opposite: the entire fix above.
  const segments = useMemo(
    () => resolveMonthlyBudgetSegments(budgets, getBudgetProgress),
    [budgets, getBudgetProgress, expenses, categories], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const showSafeToSpendRow = widgetVisibility.safeToSpend && hasSafeToSpend && !!safeToSpendData;
  // "the net-profit block only when widgetVisibility.netProfit" (design) gates
  // the block's OWN content, but `NetProfitWidget` remains the sole existing
  // host for the Safe-to-Spend row on desktop — it gains the row as a prop,
  // there is no second, standalone component for it (see the design's
  // "Component moves"). So the widget mounts whenever EITHER half wants to
  // show; turning Net Profit off specifically while leaving Safe to Spend on
  // is a narrow, unmocked combination, and showing the chart anyway in that
  // one case is the smaller deviation — the alternative (never mounting the
  // widget) would silently drop Safe to Spend again, exactly the regression
  // this task exists to fix (design Goal §1).
  const showNetProfitContent = widgetVisibility.netProfit;
  const showHero = showSafeToSpendRow || showNetProfitContent;

  const showIncomeExpenses = widgetVisibility.incomeExpenses;
  // Same "has something to show" gate `renderHomeWidget('monthlyBudget', ...)`
  // already uses on mobile — kept identical so the two platforms never
  // disagree about whether this card has content.
  const showMonthlyBudget = widgetVisibility.monthlyBudget && monthlyBudgetSummary.budgetCount > 0;
  // Same gate `renderHomeWidget`'s `'wallets'` case uses for the rail —
  // visibility alone, no "has balances" check, because `WalletsSection`
  // always renders something (a real balance grid or its own empty-state
  // prompt to add one).
  const showWallets = widgetVisibility.wallets;

  // The three states, ahead of the visibility branches below. Both of these
  // replace the whole column rather than sitting above it: the spec's own
  // rule is "no mock data anywhere", and a real widget reporting absence
  // beside an invitation to add the first thing is exactly the nine-empty-
  // cards reading this state exists to stop. Placed after every hook above,
  // never before one — an early return that changes the hook count would
  // crash on a browser resize across a width threshold.
  if (firstRunView === 'wait') return <FocusColumnLoading />;
  if (firstRunView === 'first-run') return <FirstRunPanel onSkip={onSkipFirstRun} />;

  if (!showHero && !showIncomeExpenses && !showMonthlyBudget && !showWallets) {
    return <FocusColumnEmptyState />;
  }

  return (
    <View>
      {showHero && (
        <NetProfitWidget
          refreshKey={widgetRefreshKey}
          showRangeChips
          compact
          safeToSpend={
            showSafeToSpendRow
              ? { data: safeToSpendData, hasEnoughData: hasSafeToSpend, onPress: onOpenSafeToSpend }
              : undefined
          }
        />
      )}
      {showIncomeExpenses && <IncomeExpensesCard ctx={ctx} showCounts />}
      {showMonthlyBudget && <MonthlyBudgetCard ctx={ctx} segments={segments} />}
      {showWallets && <WalletsSection ctx={ctx} />}
    </View>
  );
}

/**
 * The loading state, and the one this screen must never skip: on web a failed
 * pull is indistinguishable from an empty account, so rendering the ordinary
 * (empty) dashboard while the request is still in flight is what makes an
 * offline first paint look like a brand-new account. One centred spinner, and
 * the rail is empty beside it.
 *
 * It is bounded — see `FIRST_RUN_WAIT_TIMEOUT_MS`; after that the ordinary
 * dashboard is drawn rather than this spinner staying up for ever.
 */
function FocusColumnLoading() {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

function FocusColumnEmptyState() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.emptyCard}>
      <Ionicons name="eye-off-outline" size={40} color={theme.colors.textDisabled} />
      <Text style={styles.emptyTitle}>{t('dashboardDesktop.focusEmptyTitle')}</Text>
      <Text style={styles.emptyBody}>
        {t('dashboardDesktop.focusEmptyBody', {
          safeToSpend: t('safeToSpend.widgetLabel'),
          netProfit: t('dashboard.netProfit'),
          incomeExpenses: t('settings.widget.incomeExpenses'),
          monthlyBudget: t('dashboard.monthlyBudget'),
          wallets: t('settings.widget.wallets'),
        })}
      </Text>
      <TouchableOpacity onPress={() => router.push('/settings/widgets')} activeOpacity={0.7} accessibilityRole="button">
        <Text style={styles.emptyLink}>{t('dashboardDesktop.manageWidgets')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  loading: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[20],
  },
  emptyCard: {
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[6],
    gap: theme.spacing[2],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
  emptyBody: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  emptyLink: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textLink,
    fontWeight: '600' as const,
    marginTop: theme.spacing[2],
  },
});
