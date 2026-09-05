import { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { NetProfitWidget } from '@/components/widgets';
import { IncomeExpensesCard } from '@/components/home/widgets/IncomeExpensesCard';
import { MonthlyBudgetCard } from '@/components/home/widgets/MonthlyBudgetCard';
import { useBudgetStore } from '@/stores/budgetStore';
import { resolveMonthlyBudgetSegments } from '@/features/dashboard/monthlyBudgetSegments';
import type { HomeWidgetContext } from '@/components/home/HomeWidgetContext';

interface FocusColumnProps {
  ctx: HomeWidgetContext;
  onOpenSafeToSpend: () => void;
}

/**
 * Desktop web's fixed three-slot "lead story" (`docs/design/2026-09-05-
 * dashboard-web.md`'s "The focus column") — hero (Safe-to-Spend + Net
 * Profit), Income & Expenses, Monthly Budget, top to bottom, in that FIXED
 * order regardless of `widgetOrder` (see the design's "A consequence worth
 * stating outright" — only visibility, not position, is user-driven for
 * these four keys on desktop). This is ordinary top-to-bottom flow, not a
 * promotion algorithm: there is no code that decides "since the hero is
 * hidden, promote X into its place" — whatever slot is next in this fixed
 * template simply becomes the first thing shown.
 *
 * Each slot is independently visible only when its backing widget(s) are
 * visible AND have something to show. When all three collapse, this renders
 * one centred empty state instead of a blank column beside a populated rail
 * — "the one genuinely new empty state this spec adds" per the design,
 * because a blank focus column is the worst failure this layout has (it's
 * the first thing shown after signing in).
 */
export function FocusColumn({ ctx, onOpenSafeToSpend }: FocusColumnProps) {
  const { widgetVisibility, monthlyBudgetSummary, safeToSpendData, hasSafeToSpend, widgetRefreshKey } = ctx;

  const { budgets, getBudgetProgress } = useBudgetStore();
  const segments = useMemo(
    () => resolveMonthlyBudgetSegments(budgets, getBudgetProgress),
    [budgets, getBudgetProgress],
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

  if (!showHero && !showIncomeExpenses && !showMonthlyBudget) {
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
      {showIncomeExpenses && <IncomeExpensesCard ctx={ctx} />}
      {showMonthlyBudget && <MonthlyBudgetCard ctx={ctx} segments={segments} />}
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
        })}
      </Text>
      <TouchableOpacity onPress={() => router.push('/settings/widgets')} activeOpacity={0.7} accessibilityRole="button">
        <Text style={styles.emptyLink}>{t('dashboardDesktop.manageWidgets')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
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
