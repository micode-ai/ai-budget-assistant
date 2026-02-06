import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatPercentageChange } from '@budget/shared-utils';
import { useAnalytics, TimeRange } from '@/features/analytics/useAnalytics';
import { BarChart, PieChart } from '@/components/charts';

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const [selectedRange, setSelectedRange] = useState<TimeRange>('month');
  const { user } = useAuthStore();
  const { dailySpending, categorySpending, summary } = useAnalytics(selectedRange);

  const TIME_RANGES: { key: TimeRange; label: string }[] = [
    { key: 'week', label: t('analytics.week') },
    { key: 'month', label: t('analytics.month') },
    { key: 'year', label: t('analytics.year') },
  ];

  const currency = user?.currencyCode || 'USD';

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

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('analytics.totalSpent')}</Text>
            <Text style={styles.summaryValue}>{formatCurrency(summary.totalSpent, currency)}</Text>
            <View style={styles.statsRow}>
              <Ionicons name="receipt-outline" size={14} color="#999" />
              <Text style={styles.statsText}>{summary.transactionCount} {t('analytics.transactions')}</Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('analytics.avgPerDay')}</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(summary.averagePerDay, currency)}
            </Text>
            <Text style={styles.summarySubtext}>{t('analytics.this')} {selectedRange}</Text>
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
            barColor="#4ECDC4"
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
              <Ionicons name="pie-chart-outline" size={48} color="#ccc" />
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
              <Ionicons name="trending-up-outline" size={24} color="#FF6B6B" />
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{t('analytics.topCategory')}</Text>
                <Text style={styles.insightText}>
                  {t('analytics.topCategoryText', { category: summary.mostExpensiveCategory, period: selectedRange })}
                </Text>
              </View>
            </View>
          )}

          {summary.highestSpendingDay && (
            <View style={styles.insightCard}>
              <Ionicons name="calendar-outline" size={24} color="#45B7D1" />
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{t('analytics.peakSpendingDay')}</Text>
                <Text style={styles.insightText}>
                  {t('analytics.peakSpendingDayText', {
                    date: new Date(summary.highestSpendingDay).toLocaleDateString('en-US', {
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
            <Ionicons name="bulb-outline" size={24} color="#FFEAA7" />
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>{t('analytics.dailyBudgetTip')}</Text>
              <Text style={styles.insightText}>
                {t('analytics.dailyBudgetTipText', { amount: formatCurrency(summary.averagePerDay * 0.9, currency) })}
              </Text>
            </View>
          </View>
        </View>

        {/* Export Button */}
        <TouchableOpacity style={styles.exportButton}>
          <Ionicons name="download-outline" size={20} color="#4ECDC4" />
          <Text style={styles.exportButtonText}>{t('analytics.exportReport')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  rangeSelector: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  rangeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  rangeButtonActive: {
    backgroundColor: '#4ECDC4',
  },
  rangeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  rangeButtonTextActive: {
    color: '#fff',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statsText: {
    fontSize: 12,
    color: '#999',
  },
  summarySubtext: {
    fontSize: 12,
    color: '#999',
  },
  chartContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  emptyCategory: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyCategoryText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  emptyCategorySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  categoryItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryName: {
    fontSize: 16,
    color: '#333',
  },
  categoryValues: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  categoryPercent: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  insightCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 12,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  insightText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4ECDC4',
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ECDC4',
  },
});
