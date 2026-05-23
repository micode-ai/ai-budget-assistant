import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { InteractiveDonutChart } from '@/components/interactive-charts';
import { useStyles, type Theme } from '@/theme';
import type { TagSpending } from '@/features/analytics/useAnalytics';

interface Props {
  tagSpending: TagSpending[];
  currency: string;
}

const formatChartValue = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(0);
};

export function TagBreakdown({ tagSpending, currency }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.byTag')}</Text>
      <View style={styles.chartContainer}>
        <InteractiveDonutChart
          data={tagSpending.map((ts) => ({
            label: ts.name,
            value: ts.amount,
            color: ts.color,
            id: ts.tagId,
          }))}
          size={140}
          formatValue={formatChartValue}
          showLegend={true}
        />
      </View>
      {tagSpending.map((ts) => (
        <View key={ts.tagId} style={styles.categoryItem}>
          <View style={styles.categoryInfo}>
            <View style={[styles.categoryDot, { backgroundColor: ts.color }]} />
            <Text style={styles.categoryName}>{ts.name}</Text>
          </View>
          <View style={styles.categoryValues}>
            <Text style={styles.categoryAmount}>
              {formatCurrency(ts.amount, currency)}
            </Text>
            <Text style={styles.categoryPercent}>{ts.percentage.toFixed(0)}%</Text>
          </View>
        </View>
      ))}
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
  chartContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    ...theme.shadows.sm,
  },
  categoryItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  categoryInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: theme.borderRadius.sm,
  },
  categoryName: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
  },
  categoryValues: {
    alignItems: 'flex-end' as const,
  },
  categoryAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  categoryPercent: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
});
