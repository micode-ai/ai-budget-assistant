import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { formatCurrency, formatPercentageChange } from '@budget/shared-utils';
import { useAnalytics, TimeRange } from '@/features/analytics/useAnalytics';
import { BarChart, PieChart } from '@/components/charts';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Currency } from '@budget/shared-types';

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const [selectedRange, setSelectedRange] = useState<TimeRange>('month');
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | undefined>(undefined);
  const { user } = useAuthStore();
  const { walletSummary } = useWalletStore();
  const { dailySpending, categorySpending, summary, itemBreakdown } = useAnalytics(selectedRange, selectedCurrency);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const TIME_RANGES: { key: TimeRange; label: string }[] = [
    { key: 'week', label: t('analytics.week') },
    { key: 'month', label: t('analytics.month') },
    { key: 'year', label: t('analytics.year') },
  ];

  const availableCurrencies = walletSummary.map((s) => s.currencyCode);
  const currency = selectedCurrency || user?.currencyCode || 'USD';

  // Format currency helper for charts
  const formatChartValue = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toFixed(0);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Time Range Selector */}
        <View style={styles.rangeSelector}>
          {TIME_RANGES.map((range) => (
            <TouchableOpacity
              key={range.key}
              style={[
                styles.rangeButton,
                selectedRange === range.key && styles.rangeButtonActive,
              ]}
              onPress={() => setSelectedRange(range.key)}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  selectedRange === range.key && styles.rangeButtonTextActive,
                ]}
              >
                {range.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Currency Filter */}
        {availableCurrencies.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyFilter}>
            <TouchableOpacity
              style={[styles.currencyChip, !selectedCurrency && styles.currencyChipActive]}
              onPress={() => setSelectedCurrency(undefined)}
            >
              <Text style={[styles.currencyChipText, !selectedCurrency && styles.currencyChipTextActive]}>
                {t('analytics.allCurrencies')}
              </Text>
            </TouchableOpacity>
            {availableCurrencies.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyChip, selectedCurrency === c && styles.currencyChipActive]}
                onPress={() => setSelectedCurrency(c)}
              >
                <Text style={[styles.currencyChipText, selectedCurrency === c && styles.currencyChipTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('analytics.totalSpent')}</Text>
            <Text style={styles.summaryValue}>{formatCurrency(summary.totalSpent, currency)}</Text>
            <View style={styles.statsRow}>
              <Ionicons name="receipt-outline" size={14} color={theme.colors.textTertiary} />
              <Text style={styles.statsText}>{summary.transactionCount} {t('analytics.transactions')}</Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('analytics.avgPerDay')}</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(summary.averagePerDay, currency)}
            </Text>
            <Text style={styles.summarySubtext}>{t('analytics.thisRange', { range: t(`analytics.${selectedRange}`) })}</Text>
          </View>
        </View>

        {/* Spending Trend Chart */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>
            {selectedRange === 'year' ? t('analytics.spendingByMonth') : t('analytics.spendingTrend')}
          </Text>
          <BarChart
            data={dailySpending.map((d) => ({
              label: d.dayLabel,
              value: d.amount,
            }))}
            height={150}
            barColor={theme.colors.primary}
            showLabels={true}
            showValues={dailySpending.length <= 12}
            formatValue={formatChartValue}
          />
        </View>

        {/* Category Breakdown */}
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
              <PieChart
                data={categorySpending.map((c) => ({
                  label: c.name,
                  value: c.amount,
                  color: c.color,
                }))}
                size={120}
                showLegend={false}
              />
            </View>
          )}
        </View>

        {/* Category List */}
        {categorySpending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('analytics.categoryDetails')}</Text>
            {categorySpending.map((category, index) => (
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
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Insights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('analytics.quickInsights')}</Text>

          {summary.mostExpensiveCategory && (
            <View style={styles.insightCard}>
              <Ionicons name="trending-up-outline" size={24} color={theme.colors.danger} />
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{t('analytics.topCategory')}</Text>
                <Text style={styles.insightText}>
                  {t('analytics.topCategoryText', { category: summary.mostExpensiveCategory, range: t(`analytics.${selectedRange}`) })}
                </Text>
              </View>
            </View>
          )}

          {summary.highestSpendingDay && (
            <View style={styles.insightCard}>
              <Ionicons name="calendar-outline" size={24} color={theme.colors.info} />
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{t('analytics.peakSpendingDay')}</Text>
                <Text style={styles.insightText}>
                  {t('analytics.peakSpendingText', {
                    date: new Date(summary.highestSpendingDay).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    }),
                  })}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.insightCard}>
            <Ionicons name="bulb-outline" size={24} color={theme.colors.warning} />
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>{t('analytics.dailyBudgetTip')}</Text>
              <Text style={styles.insightText}>
                {t('analytics.dailyBudgetText', { amount: formatCurrency(summary.averagePerDay * 0.9, currency) })}
              </Text>
            </View>
          </View>
        </View>

        {/* Top Receipt Items */}
        {itemBreakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('analytics.topItems')}</Text>
            {itemBreakdown.slice(0, 10).map((item, index) => (
              <View key={item.description} style={styles.topItemRow}>
                <View style={styles.topItemRank}>
                  <Text style={styles.topItemRankText}>{index + 1}</Text>
                </View>
                <View style={styles.topItemInfo}>
                  <Text style={styles.topItemName} numberOfLines={1}>{item.description}</Text>
                  <Text style={styles.topItemMeta}>
                    {t('analytics.itemPurchaseCount')}: {item.count}
                  </Text>
                </View>
                <Text style={styles.topItemAmount}>
                  {formatCurrency(item.totalSpent, currency)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Export Button */}
        <TouchableOpacity style={styles.exportButton}>
          <Ionicons name="download-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.exportButtonText}>{t('analytics.exportReport')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  rangeSelector: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
    marginBottom: theme.spacing[5],
  },
  rangeButton: {
    flex: 1,
    paddingVertical: theme.spacing[2.5],
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  rangeButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  rangeButtonText: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  rangeButtonTextActive: {
    color: theme.colors.textInverse,
  },
  currencyFilter: {
    flexDirection: 'row' as const,
    marginBottom: theme.spacing[4],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  currencyChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  currencyChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  currencyChipTextActive: {
    color: '#FFFFFF',
  },
  summaryRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[5],
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  summaryLabel: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
  },
  summaryValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  statsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  statsText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  summarySubtext: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  chartContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    ...theme.shadows.sm,
  },
  chartTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
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
  insightCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    ...theme.shadows.sm,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  insightText: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  topItemRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    marginBottom: theme.spacing[2],
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  topItemRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing[3],
  },
  topItemRankText: {
    ...theme.textStyles.bodySmMedium,
    fontWeight: '700' as const,
    color: theme.colors.textInverse,
  },
  topItemInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  topItemName: {
    ...theme.textStyles.body,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
    textTransform: 'capitalize' as const,
  },
  topItemMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  topItemAmount: {
    ...theme.textStyles.body,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  exportButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  exportButtonText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.primary,
  },
});
