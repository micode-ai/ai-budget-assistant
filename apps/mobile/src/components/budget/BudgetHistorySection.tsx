import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useBudgetStore } from '@/stores/budgetStore';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { Budget } from '@budget/shared-types';
import { GroupedBarChart } from '@/components/charts/GroupedBarChart';
import { useTheme, useStyles, type Theme } from '@/theme';

interface BudgetHistorySectionProps {
  budget: Budget;
}

export function BudgetHistorySection({ budget }: BudgetHistorySectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { budgetHistory, loadBudgetHistory } = useBudgetStore();

  useEffect(() => {
    if (budget.period !== 'custom') {
      loadBudgetHistory(budget.id, 6);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget.id]);

  const historyData = budgetHistory[budget.id] || [];

  if (budget.period === 'custom' || historyData.length === 0) {
    return null;
  }

  const historyOverCount = historyData.filter((h) => h.isOverBudget).length;
  const historyTotal = historyData.length;
  const historyAvgOverage =
    historyOverCount > 0
      ? historyData.filter((h) => h.isOverBudget).reduce((s, h) => s + (h.actual - h.limit), 0) /
        historyOverCount
      : 0;
  const historySavings = historyData.filter((h) => !h.isOverBudget);
  const historyAvgSavings =
    historySavings.length > 0
      ? historySavings.reduce((s, h) => s + (h.limit - h.actual), 0) / historySavings.length
      : 0;

  const locale = getIntlLocale();
  const shortLabel = (iso: string): string => {
    const d = new Date(iso);
    switch (budget.period) {
      case 'daily':
        return d.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
      case 'weekly':
        return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      case 'monthly':
        return d.toLocaleDateString(locale, { month: 'short' });
      case 'yearly':
        return String(d.getFullYear());
      default:
        return '';
    }
  };

  const chartData = historyData.map((h) => ({
    label: shortLabel(h.periodStart),
    values: [
      { value: h.actual, color: h.isOverBudget ? theme.colors.danger : theme.colors.primary },
      { value: h.limit, color: theme.colors.textDisabled },
    ],
  }));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('budgetDetail.history.title')}</Text>
      <Text style={styles.summary}>
        {historyOverCount > 0
          ? t('budgetDetail.history.overCount', { count: historyOverCount, total: historyTotal })
          : t('budgetDetail.history.avgSavings', {
              amount: formatCurrency(historyAvgSavings, budget.currencyCode),
            })}
      </Text>
      {historyOverCount > 0 && (
        <Text style={styles.subSummary}>
          {t('budgetDetail.history.avgOverage', {
            amount: formatCurrency(historyAvgOverage, budget.currencyCode),
          })}
        </Text>
      )}
      <GroupedBarChart
        data={chartData}
        height={140}
        showLabels
        legendItems={[
          { label: t('budgetDetail.history.spent'), color: theme.colors.primary },
          { label: t('budgetDetail.history.limit'), color: theme.colors.textDisabled },
        ]}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  summary: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  subSummary: {
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing[4],
  },
});
