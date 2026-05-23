import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { InteractiveDonutChart } from '@/components/interactive-charts';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { CategorySpending } from '@/features/analytics/useAnalytics';

interface Props {
  categorySpending: CategorySpending[];
  currency: string;
}

const formatChartValue = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(0);
};

export function CategoryBreakdown({ categorySpending, currency }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <>
      {/* Category Donut Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('analytics.spendingByCategory')}</Text>

        {categorySpending.length === 0 ? (
          <View style={styles.emptyCategory}>
            <Ionicons name="pie-chart-outline" size={48} color={theme.colors.textDisabled} />
            <Text style={styles.emptyCategoryText}>{t('analytics.noData')}</Text>
            <Text style={styles.emptyCategorySubtext}>{t('analytics.addExpensesHint')}</Text>
          </View>
        ) : (
          <View style={styles.chartContainer}>
            <InteractiveDonutChart
              data={categorySpending.map((c) => ({
                label: c.name,
                value: c.amount,
                color: c.color,
                id: c.categoryId || undefined,
              }))}
              size={160}
              formatValue={formatChartValue}
              showLegend={true}
            />
          </View>
        )}
      </View>

      {/* Category List */}
      {categorySpending.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('analytics.categoryDetails')}</Text>
          {categorySpending.map((category, index) => {
            const delta = category.vsAverage;
            const showChip = delta != null && Math.abs(delta) >= 5;
            const isAbove = delta != null && delta > 0;
            return (
              <View key={category.categoryId || index} style={styles.categoryItem}>
                <View style={styles.categoryInfo}>
                  <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                  <Text style={styles.categoryName}>{category.name}</Text>
                </View>
                <View style={styles.categoryValues}>
                  <Text style={styles.categoryAmount}>
                    {formatCurrency(category.amount, currency)}
                  </Text>
                  <Text style={styles.categoryPercent}>{category.percentage.toFixed(0)}%</Text>
                  {showChip && (
                    <View style={[
                      styles.vsAvgChip,
                      { backgroundColor: isAbove ? theme.colors.dangerLight : theme.colors.successLight },
                    ]}>
                      <Text style={[
                        styles.vsAvgChipText,
                        { color: isAbove ? theme.colors.danger : theme.colors.success },
                      ]}>
                        {isAbove ? '+' : ''}{Math.round(delta!)}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </>
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
  emptyCategory: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[8],
    alignItems: 'center' as const,
  },
  emptyCategoryText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[3],
  },
  emptyCategorySubtext: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
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
  vsAvgChip: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    marginTop: theme.spacing[1],
    alignSelf: 'flex-end' as const,
  },
  vsAvgChipText: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 14,
  },
});
