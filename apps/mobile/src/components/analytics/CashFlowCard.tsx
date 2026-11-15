import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { GroupedBarChart } from '@/components/charts';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { CashFlowSummary, MonthlyCashFlow } from '@/features/analytics/cashFlow';

interface Props {
  cashFlow: CashFlowSummary;
  months: MonthlyCashFlow[];
  currency: string;
}

const formatChartValue = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0));

/**
 * Earned / spent / kept for the selected period, the savings rate, and an
 * earned-vs-spent bar pair per month. Rendered by both the phone tab and the
 * desktop screen (`desktop/CashFlowRow.tsx`); see
 * docs/wiki/features/analytics-cash-flow.md.
 */
export function CashFlowCard({ cashFlow, months, currency }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const overspent = cashFlow.saved < 0;
  const monthFormat = new Intl.DateTimeFormat(getIntlLocale(), { month: 'short' });
  const showChart = months.length > 1 && months.some((m) => m.earned > 0 || m.spent > 0);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.cashFlowTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('analytics.cashFlowEarned')}</Text>
            {/* Green only when something was earned — a green zero reads as good news. */}
            <Text
              style={[styles.statValue, cashFlow.earned > 0 && { color: theme.colors.success }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCurrency(cashFlow.earned, currency)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('analytics.cashFlowSpent')}</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(cashFlow.spent, currency)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>
              {overspent ? t('analytics.cashFlowOverspent') : t('analytics.cashFlowKept')}
            </Text>
            <Text
              style={[styles.statValue, { color: overspent ? theme.colors.danger : theme.colors.success }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCurrency(Math.abs(cashFlow.saved), currency)}
            </Text>
          </View>
        </View>

        <Text style={styles.rateText}>
          {cashFlow.savingsRate === null
            ? t('analytics.cashFlowNoIncome')
            : t('analytics.cashFlowSavingsRate', { pct: Math.round(cashFlow.savingsRate) })}
        </Text>

        {showChart && (
          <View style={styles.chart}>
            <GroupedBarChart
              data={months.map((m) => ({
                label: monthFormat.format(m.start),
                values: [
                  { value: m.earned, color: theme.colors.success },
                  { value: m.spent, color: theme.colors.danger },
                ],
              }))}
              formatValue={formatChartValue}
              legendItems={[
                { label: t('analytics.cashFlowEarned'), color: theme.colors.success },
                { label: t('analytics.cashFlowSpent'), color: theme.colors.danger },
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginBottom: theme.spacing[5],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  statsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  stat: {
    flex: 1,
    minWidth: 0,
  },
  statLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  statValue: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  rateText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[3],
  },
  chart: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
});
