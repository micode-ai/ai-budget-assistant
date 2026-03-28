import { View, Text, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { useInsightsStore } from '@/stores/insightsStore';
import { useTagStore } from '@/stores/tagStore';
import { useProjectStore } from '@/stores/projectStore';
import { formatCurrency } from '@budget/shared-utils';
import { useAnalytics, TimeRange } from '@/features/analytics/useAnalytics';
import { WeekdayChart } from '@/components/charts';
import { InteractiveBarChart, InteractiveDonutChart } from '@/components/interactive-charts';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { Currency } from '@budget/shared-types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AnalyticsScreen() {
  const { t, i18n } = useTranslation();
  const [selectedRange, setSelectedRange] = useState<TimeRange>('month');
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | undefined>(undefined);
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-based
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const { user } = useAuthStore();
  const { walletSummary } = useWalletStore();
  const { dailySpending, categorySpending, summary, itemBreakdown, dayOfWeekSpending, periodComparison, anomalies, predictions, dateRange, tagSpending, projectSpending } = useAnalytics(selectedRange, selectedCurrency, selectedRange !== 'week' ? selectedMonth : undefined, selectedYear);
  const { aiInsights, loadAIInsights } = useInsightsStore();
  const { loadRates } = useExchangeRateStore();
  const { loadTags } = useTagStore();
  const { loadProjects } = useProjectStore();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const intlLocale = getIntlLocale();

  useEffect(() => {
    loadAIInsights(i18n.language);
    loadRates();
    loadTags();
    loadProjects();
  }, [loadAIInsights, loadRates, loadTags, loadProjects, i18n.language]);

  const TIME_RANGES: { key: TimeRange; label: string }[] = [
    { key: 'week', label: t('analytics.week') },
    { key: 'month', label: t('analytics.month') },
    { key: 'year', label: t('analytics.year') },
  ];

  // Month/Year navigation
  const isCurrentPeriod = selectedRange === 'month'
    ? selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()
    : selectedYear === now.getFullYear();

  const getPeriodLabel = (): string => {
    if (selectedRange === 'year') {
      return `${selectedYear}`;
    }
    const date = new Date(selectedYear, selectedMonth - 1, 1);
    const monthName = date.toLocaleDateString(intlLocale, { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${selectedYear}`;
  };

  const goToPrevPeriod = useCallback(() => {
    if (selectedRange === 'year') {
      setSelectedYear((y) => y - 1);
    } else {
      if (selectedMonth === 1) {
        setSelectedMonth(12);
        setSelectedYear((y) => y - 1);
      } else {
        setSelectedMonth((m) => m - 1);
      }
    }
  }, [selectedRange, selectedMonth]);

  const goToNextPeriod = useCallback(() => {
    if (isCurrentPeriod) return;
    if (selectedRange === 'year') {
      setSelectedYear((y) => y + 1);
    } else {
      if (selectedMonth === 12) {
        setSelectedMonth(1);
        setSelectedYear((y) => y + 1);
      } else {
        setSelectedMonth((m) => m + 1);
      }
    }
  }, [selectedRange, selectedMonth, isCurrentPeriod]);

  const toggleInsight = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedInsightId((prev) => (prev === id ? null : id));
  }, []);

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
              onPress={() => {
                setSelectedRange(range.key);
                if (range.key === 'week') {
                  setSelectedMonth(now.getMonth() + 1);
                  setSelectedYear(now.getFullYear());
                }
              }}
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

        {/* Month/Year Picker (hidden for 'week' range) */}
        {selectedRange !== 'week' && (
          <View style={styles.monthPickerRow}>
            <TouchableOpacity onPress={goToPrevPeriod} hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
            <Text style={styles.monthPickerLabel}>{getPeriodLabel()}</Text>
            <TouchableOpacity onPress={goToNextPeriod} hitSlop={8} disabled={isCurrentPeriod}>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={isCurrentPeriod ? theme.colors.textDisabled : theme.colors.primary}
              />
            </TouchableOpacity>
          </View>
        )}

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
            {periodComparison.previousTotal > 0 ? (
              <View style={styles.statsRow}>
                <Ionicons
                  name={periodComparison.changePercent > 0 ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color={periodComparison.changePercent > 0 ? theme.colors.danger : theme.colors.success}
                />
                <Text style={[
                  styles.trendText,
                  { color: periodComparison.changePercent > 0 ? theme.colors.danger : theme.colors.success },
                ]}>
                  {Math.abs(periodComparison.changePercent).toFixed(0)}%{' '}
                  {periodComparison.changePercent > 0
                    ? t('analytics.periodUp', { period: t(`analytics.${selectedRange}`) })
                    : t('analytics.periodDown', { period: t(`analytics.${selectedRange}`) })
                  }
                </Text>
              </View>
            ) : (
              <View style={styles.statsRow}>
                <Ionicons name="receipt-outline" size={14} color={theme.colors.textTertiary} />
                <Text style={styles.statsText}>{summary.transactionCount} {t('analytics.transactions')}</Text>
              </View>
            )}
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('analytics.avgPerDay')}</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(summary.averagePerDay, currency)}
            </Text>
            <Text style={styles.summarySubtext}>{t(`analytics.this_${selectedRange}`)}</Text>
          </View>
        </View>

        {/* Story Banner */}
        <TouchableOpacity
          style={styles.storyBanner}
          onPress={() => router.push({
            pathname: '/story',
            params: {
              month: String(selectedMonth),
              year: String(selectedYear),
            },
          })}
        >
          <Ionicons name="book-outline" size={24} color={theme.colors.primary} />
          <View style={styles.storyBannerContent}>
            <Text style={styles.storyBannerTitle}>{t('story.viewStory')}</Text>
            <Text style={styles.storyBannerSubtext}>{t('story.title')}</Text>
          </View>
          <Ionicons name="sparkles" size={16} color={theme.colors.warning} />
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </TouchableOpacity>

        {/* Scenario Simulator Banner */}
        <TouchableOpacity
          style={styles.storyBanner}
          onPress={() => router.push('/scenario-simulator')}
        >
          <Ionicons name="flask-outline" size={24} color={theme.colors.primary} />
          <View style={styles.storyBannerContent}>
            <Text style={styles.storyBannerTitle}>{t('scenarioSimulator.title')}</Text>
            <Text style={styles.storyBannerSubtext}>{t('scenarioSimulator.subtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </TouchableOpacity>

        {/* AI Insights */}
        {aiInsights.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="sparkles" size={16} color={theme.colors.warning} />
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t('insights.aiSuggested')}</Text>
              <View style={{ flex: 1 }} />
              <AiUsageBadge />
            </View>
            {aiInsights.slice(0, 5).map((insight) => {
              const isExpanded = expandedInsightId === insight.id;
              const severityColor = insight.severity === 'critical' ? theme.colors.danger : insight.severity === 'warning' ? theme.colors.warning : theme.colors.info;
              const severityBg = insight.severity === 'critical' ? theme.colors.dangerLight : insight.severity === 'warning' ? theme.colors.warningLight : theme.colors.primaryLight;
              return (
                <TouchableOpacity
                  key={insight.id}
                  style={styles.aiInsightCard}
                  activeOpacity={0.7}
                  onPress={() => toggleInsight(insight.id)}
                >
                  <View style={styles.aiInsightHeader}>
                    <View style={[styles.aiSeverityBadge, { backgroundColor: severityBg }]}>
                      <Ionicons
                        name={insight.severity === 'critical' ? 'alert-circle' : insight.severity === 'warning' ? 'warning' : 'information-circle'}
                        size={16}
                        color={severityColor}
                      />
                    </View>
                    <Text style={styles.aiInsightTitle} numberOfLines={isExpanded ? undefined : 1}>{insight.title}</Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={theme.colors.textTertiary}
                    />
                  </View>
                  <Text style={styles.aiInsightDescription} numberOfLines={isExpanded ? undefined : 2}>{insight.description}</Text>
                  {insight.actionSuggestion && (
                    <View style={styles.aiInsightAction}>
                      <Ionicons name="bulb-outline" size={14} color={theme.colors.primary} />
                      <Text style={styles.aiInsightActionText} numberOfLines={isExpanded ? undefined : 1}>{insight.actionSuggestion}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Spending Trend Chart - Interactive */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>
            {selectedRange === 'year' ? t('analytics.spendingByMonth') : t('analytics.spendingTrend')}
          </Text>
          <InteractiveBarChart
            data={dailySpending.map((d) => ({
              label: d.dayLabel,
              value: d.amount,
              id: d.date,
            }))}
            height={180}
            barColor={theme.colors.primary}
            showValues={dailySpending.length <= 12}
            formatValue={formatChartValue}
            onBarPress={(item) => {
              router.push({
                pathname: '/analytics/drill-down',
                params: {
                  startDate: dateRange.startDate.toISOString(),
                  endDate: dateRange.endDate.toISOString(),
                  currencyCode: currency,
                  level: selectedRange === 'year' ? 'year' : 'month',
                },
              });
            }}
          />
          <Text style={styles.drillDownHint}>{t('drillDown.tapToExplore')}</Text>
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

        {/* Tag Breakdown */}
        {tagSpending.length > 0 && (
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
            {tagSpending.map((ts, index) => (
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
        )}

        {/* Project Breakdown */}
        {projectSpending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('analytics.byProject')}</Text>
            {projectSpending.map((ps) => (
              <View key={ps.projectId} style={styles.projectItem}>
                <View style={styles.projectHeader}>
                  <View style={styles.categoryInfo}>
                    <View style={[styles.projectDot, { backgroundColor: ps.color }]} />
                    <Text style={styles.categoryName}>{ps.name}</Text>
                  </View>
                  <Text style={styles.categoryAmount}>
                    {formatCurrency(ps.amount, currency)}
                  </Text>
                </View>
                {ps.budget != null && ps.budget > 0 && (
                  <View style={styles.projectBudgetBar}>
                    <View style={styles.projectBudgetTrack}>
                      <View
                        style={[
                          styles.projectBudgetFill,
                          {
                            width: `${Math.min((ps.amount / ps.budget) * 100, 100)}%`,
                            backgroundColor: ps.amount > ps.budget ? theme.colors.danger : ps.color,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.projectBudgetText}>
                      {ps.amount > ps.budget
                        ? t('analytics.overBudget')
                        : `${formatCurrency(ps.budget - ps.amount, currency)} ${t('projects.budgetRemaining')}`
                      }
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Spending by Day of Week */}
        {dayOfWeekSpending.some((d) => d.totalAmount > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('analytics.dayOfWeekTitle')}</Text>
            <View style={styles.chartContainer}>
              <WeekdayChart
                data={dayOfWeekSpending.map((d) => ({
                  label: d.dayLabel,
                  value: d.totalAmount,
                  count: d.transactionCount,
                }))}
                formatValue={formatChartValue}
              />
              {(() => {
                const peak = dayOfWeekSpending.reduce((max, d) => (d.totalAmount > max.totalAmount ? d : max), dayOfWeekSpending[0]);
                return peak && peak.totalAmount > 0 ? (
                  <View style={styles.weekdayInsight}>
                    <Ionicons name="information-circle-outline" size={16} color={theme.colors.info} />
                    <Text style={styles.weekdayInsightText}>
                      {t('analytics.peakDayInsight', { day: peak.dayLabel })}
                    </Text>
                  </View>
                ) : null;
              })()}
            </View>
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
                    date: new Date(summary.highestSpendingDay).toLocaleDateString(getIntlLocale(), {
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

          {summary.totalDiscountSavings > 0 && (
            <View style={styles.insightCard}>
              <Ionicons name="pricetag-outline" size={24} color={theme.colors.success} />
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{t('analytics.totalSavings')}</Text>
                <Text style={styles.insightText}>
                  {t('analytics.totalSavingsText', {
                    amount: formatCurrency(summary.totalDiscountSavings, currency),
                    range: t(`analytics.${selectedRange}`),
                  })}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Predictive Insights — Anomalies */}
        {anomalies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('insights.anomalies')}</Text>
            {anomalies.map((anomaly) => (
              <View key={anomaly.categoryId} style={styles.insightCard}>
                <Ionicons name="warning-outline" size={24} color={theme.colors.warning} />
                <View style={styles.insightContent}>
                  <Text style={styles.insightTitle}>{anomaly.categoryName}</Text>
                  <Text style={styles.insightText}>
                    {t('insights.anomalyText', {
                      percent: anomaly.percentageChange,
                      category: anomaly.categoryName,
                    })}
                  </Text>
                  <Text style={[styles.insightText, { marginTop: 4 }]}>
                    {formatCurrency(anomaly.currentAmount, currency)} vs {formatCurrency(anomaly.averageAmount, currency)} {t('insights.avgLabel')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Predictive Insights — Budget Predictions */}
        {predictions.filter((p) => p.estimatedExhaustionDate).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('insights.predictions')}</Text>
            {predictions
              .filter((p) => p.estimatedExhaustionDate)
              .map((prediction) => (
                <View key={prediction.budgetId} style={styles.insightCard}>
                  <Ionicons name="time-outline" size={24} color={theme.colors.danger} />
                  <View style={styles.insightContent}>
                    <Text style={styles.insightTitle}>{prediction.budgetName}</Text>
                    <Text style={styles.insightText}>
                      {t('insights.exhaustionText', {
                        date: new Date(prediction.estimatedExhaustionDate!).toLocaleDateString(getIntlLocale(), {
                          month: 'short',
                          day: 'numeric',
                        }),
                      })}
                    </Text>
                    <Text style={[styles.insightText, { marginTop: 4 }]}>
                      {t('insights.projectedTotal', {
                        amount: formatCurrency(prediction.projectedTotal, prediction.currencyCode as any),
                      })}
                    </Text>
                  </View>
                </View>
              ))}
          </View>
        )}

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
        <TouchableOpacity style={styles.exportButton} onPress={() => router.push('/reports')}>
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
    marginBottom: theme.spacing[3],
  },
  monthPickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  monthPickerLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    minWidth: 140,
    textAlign: 'center' as const,
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
  sectionTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
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
  projectItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  projectHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  projectDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  projectBudgetBar: {
    marginTop: theme.spacing[3],
  },
  projectBudgetTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden' as const,
  },
  projectBudgetFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  projectBudgetText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
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
  trendText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
  weekdayInsight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  weekdayInsightText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
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
  storyBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    gap: theme.spacing[3],
  },
  storyBannerContent: {
    flex: 1,
  },
  storyBannerTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  storyBannerSubtext: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },
  aiInsightCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    ...theme.shadows.sm,
  },
  aiInsightHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  aiSeverityBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  aiInsightTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  aiInsightDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  aiInsightAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  aiInsightActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    flex: 1,
  },
  drillDownHint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
});
