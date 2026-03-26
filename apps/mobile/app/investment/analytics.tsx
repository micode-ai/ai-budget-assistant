import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { InsightCarousel } from '@/components/insights/InsightCarousel';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import type { PortfolioAnalyticsResponse } from '@budget/shared-types';

type Period = '1W' | '1M' | '3M' | '1Y' | 'All';
type FormulaType = 'performance' | 'allocation' | 'gainers' | 'benchmark' | null;

const ALLOCATION_COLORS = [
  '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
];

const PERIODS: Period[] = ['1W', '1M', '3M', '1Y', 'All'];
const PERIOD_MAP: Record<Period, string> = {
  '1W': 'week', '1M': 'month', '3M': 'quarter', '1Y': 'year', 'All': 'all',
};

const BENCHMARKS = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'NASDAQ 100' },
  { symbol: 'DIA', name: 'Dow Jones' },
  { symbol: 'IWM', name: 'Russell 2000' },
];

export default function PortfolioAnalyticsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const loadSubscription = useSubscriptionStore((s) => s.loadSubscription);

  // AI Insights
  const { aiInsights, insightsLoading, loadInvestmentInsights, dismissInsight } = useInvestmentStore();

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('1M');
  const [selectedBenchmark, setSelectedBenchmark] = useState<string>('SPY');
  const [analytics, setAnalytics] = useState<PortfolioAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [formulaModal, setFormulaModal] = useState<FormulaType>(null);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  useEffect(() => {
    loadInvestmentInsights(i18n.language);
  }, [loadInvestmentInsights, i18n.language]);

  // Load main analytics (without benchmark) on period change
  useEffect(() => {
    fetchAnalytics(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  // Load benchmark separately when benchmark changes
  useEffect(() => {
    if (selectedBenchmark) {
      fetchBenchmark();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBenchmark]);

  const fetchAnalytics = async (includeBenchmark: boolean = false) => {
    setLoading(true);
    try {
      const benchmark = includeBenchmark ? selectedBenchmark : undefined;
      const data = await api.getPortfolioAnalytics(PERIOD_MAP[selectedPeriod], benchmark);
      setAnalytics(data);
    } catch (e) {
      console.log('Failed to fetch portfolio analytics:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBenchmark = async () => {
    setBenchmarkLoading(true);
    try {
      const data = await api.getPortfolioAnalytics(PERIOD_MAP[selectedPeriod], selectedBenchmark);
      // Only update benchmark data, keep rest of analytics
      setAnalytics((prev) => prev ? {
        ...prev,
        performance: {
          ...prev.performance,
          benchmarkValues: data.performance?.benchmarkValues,
          benchmarkName: data.performance?.benchmarkName,
        },
      } : data);
    } catch (e) {
      console.log('Failed to fetch benchmark:', e);
    } finally {
      setBenchmarkLoading(false);
    }
  };

  // Transform API response to UI format
  const performanceHistory = useMemo(() => {
    if (!analytics?.performance?.dates?.length) return [];
    return analytics.performance.dates.map((date, i) => ({
      date,
      value: analytics.performance.values[i] ?? 0,
    }));
  }, [analytics?.performance]);

  const allocation = useMemo(() => {
    if (!analytics?.allocation?.length) return [];
    return analytics.allocation.map((item, i) => ({
      type: item.assetType,
      percentage: item.percentage,
      color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
    }));
  }, [analytics?.allocation]);

  const topGainers = analytics?.topGainers || [];
  const topLosers = analytics?.topLosers || [];

  // Benchmark comparison from performance data
  const benchmarkComparison = useMemo(() => {
    if (!analytics?.performance?.benchmarkValues?.length || !analytics?.performance?.benchmarkName) return [];
    const perfValues = analytics.performance.values;
    const benchValues = analytics.performance.benchmarkValues;
    if (perfValues.length < 2 || benchValues.length < 1) return [];

    const firstPerfValue = perfValues[0];
    const lastPerfValue = perfValues[perfValues.length - 1];

    // Portfolio return: standard percentage change from first to last absolute value
    const portfolioReturn = firstPerfValue > 0
      ? ((lastPerfValue - firstPerfValue) / firstPerfValue) * 100
      : 0;

    // Benchmark values from API are already normalized percentages relative to first value:
    // benchValues[0] = 0 (baseline)
    // benchValues[last] = percentage change from first to last
    // So benchmark return is simply the last value
    const benchmarkReturn = benchValues[benchValues.length - 1];

    // Check for invalid values
    if (!isFinite(portfolioReturn) || !isFinite(benchmarkReturn)) return [];

    return [{
      name: analytics.performance.benchmarkName,
      portfolioReturn,
      benchmarkReturn,
    }];
  }, [analytics?.performance]);

  const latestValue = performanceHistory.length > 0 ? performanceHistory[performanceHistory.length - 1].value : 0;
  const earliestValue = performanceHistory.length > 0 ? performanceHistory[0].value : 0;
  const periodReturn = earliestValue > 0 ? ((latestValue - earliestValue) / earliestValue) * 100 : 0;
  const isPeriodPositive = periodReturn >= 0;

  const renderFormulaModal = () => {
    if (!formulaModal) return null;

    const formulas: Record<NonNullable<FormulaType>, { title: string; description: string; formula: string; example: string }> = {
      performance: {
        title: t('investments.formulas.performanceTitle'),
        description: t('investments.formulas.performanceDesc'),
        formula: 'Return % = ((End Value - Start Value) / Start Value) × 100',
        example: t('investments.formulas.performanceExample', {
          start: earliestValue.toFixed(2),
          end: latestValue.toFixed(2),
          result: periodReturn.toFixed(2),
        }),
      },
      allocation: {
        title: t('investments.formulas.allocationTitle'),
        description: t('investments.formulas.allocationDesc'),
        formula: 'Allocation % = (Asset Type Value / Total Portfolio Value) × 100',
        example: t('investments.formulas.allocationExample'),
      },
      gainers: {
        title: t('investments.formulas.gainersTitle'),
        description: t('investments.formulas.gainersDesc'),
        formula: 'P&L % = ((Current Price - Avg Cost) / Avg Cost) × 100',
        example: t('investments.formulas.gainersExample'),
      },
      benchmark: {
        title: t('investments.formulas.benchmarkTitle'),
        description: t('investments.formulas.benchmarkDesc'),
        formula: 'Difference = Portfolio Return % - Benchmark Return %',
        example: benchmarkComparison.length > 0
          ? t('investments.formulas.benchmarkExample', {
              portfolio: benchmarkComparison[0].portfolioReturn.toFixed(2),
              benchmark: benchmarkComparison[0].benchmarkReturn.toFixed(2),
              diff: (benchmarkComparison[0].portfolioReturn - benchmarkComparison[0].benchmarkReturn).toFixed(2),
            })
          : '',
      },
    };

    const current = formulas[formulaModal];

    return (
      <Modal
        visible={true}
        transparent
        animationType="fade"
        onRequestClose={() => setFormulaModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFormulaModal(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="calculator-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.modalTitle}>{current.title}</Text>
              <TouchableOpacity onPress={() => setFormulaModal(null)} style={styles.modalClose}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>{current.description}</Text>

            <View style={styles.formulaBox}>
              <Text style={styles.formulaLabel}>{t('investments.formulas.formula')}</Text>
              <Text style={styles.formulaText}>{current.formula}</Text>
            </View>

            {current.example && (
              <View style={styles.exampleBox}>
                <Text style={styles.exampleLabel}>{t('investments.formulas.example')}</Text>
                <Text style={styles.exampleText}>{current.example}</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('investments.analytics')}</Text>

        {/* AI Insights Carousel (Pro+) */}
        <View style={styles.insightsSection}>
          <View style={styles.insightsHeader}>
            <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
            <Text style={styles.insightsTitle}>{t('investments.insights.title')}</Text>
            <View style={{ flex: 1 }} />
            <AiUsageBadge />
          </View>
          <InsightCarousel
            insights={aiInsights}
            isLoading={insightsLoading}
            onDismiss={dismissInsight}
          />
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {PERIODS.map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodButton,
                selectedPeriod === period && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === period && styles.periodButtonTextActive,
                ]}
              >
                {period}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <>
            {/* Performance Section */}
            <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => setFormulaModal('performance')}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{t('investments.performance')}</Text>
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
              </View>
              <View style={styles.performanceHeader}>
                <Text style={styles.performanceValue}>{latestValue.toFixed(2)}</Text>
                <View style={[styles.returnBadge, { backgroundColor: isPeriodPositive ? theme.colors.success + '20' : theme.colors.danger + '20' }]}>
                  <Ionicons
                    name={isPeriodPositive ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color={isPeriodPositive ? theme.colors.success : theme.colors.danger}
                  />
                  <Text style={[styles.returnText, { color: isPeriodPositive ? theme.colors.success : theme.colors.danger }]}>
                    {isPeriodPositive ? '+' : ''}{periodReturn.toFixed(2)}%
                  </Text>
                </View>
              </View>

              {/* Simple text-based performance timeline placeholder */}
              {performanceHistory.length > 0 && (
                <View style={styles.performanceTimeline}>
                  {performanceHistory.filter((_, i) => i % Math.max(1, Math.floor(performanceHistory.length / 5)) === 0).map((entry, index) => (
                    <View key={entry.date} style={styles.timelineEntry}>
                      <Text style={styles.timelineDate}>
                        {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </Text>
                      <Text style={styles.timelineValue}>{entry.value.toFixed(0)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {performanceHistory.length === 0 && (
                <View style={styles.placeholderChart}>
                  <Ionicons name="analytics-outline" size={48} color={theme.colors.textTertiary} />
                  <Text style={styles.placeholderText}>{t('investments.noPerformanceData')}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Allocation Section */}
            <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => setFormulaModal('allocation')}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{t('investments.allocationByType')}</Text>
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
              </View>
              {allocation.length > 0 ? (
                allocation.map((item) => (
                  <View key={item.type} style={styles.allocationRow}>
                    <View style={styles.allocationInfo}>
                      <View style={[styles.allocationDot, { backgroundColor: item.color }]} />
                      <Text style={styles.allocationLabel}>{item.type}</Text>
                    </View>
                    <View style={styles.allocationBarContainer}>
                      <View style={styles.allocationBarTrack}>
                        <View
                          style={[
                            styles.allocationBarFill,
                            {
                              width: `${Math.min(item.percentage, 100)}%`,
                              backgroundColor: item.color,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.allocationPercent}>{item.percentage.toFixed(1)}%</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.placeholderChart}>
                  <Ionicons name="pie-chart-outline" size={48} color={theme.colors.textTertiary} />
                  <Text style={styles.placeholderText}>{t('investments.noAllocationData')}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Top Gainers */}
            {topGainers.length > 0 && (
              <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => setFormulaModal('gainers')}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{t('investments.topGainers')}</Text>
                  <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
                </View>
                {topGainers.map((item) => (
                  <View key={item.symbol} style={styles.gainerRow}>
                    <Text style={styles.gainerSymbol}>{item.symbol}</Text>
                    <View style={styles.gainerBadge}>
                      <Ionicons name="arrow-up" size={14} color={theme.colors.success} />
                      <Text style={[styles.gainerPercent, { color: theme.colors.success }]}>
                        +{item.pnlPercent.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                ))}
              </TouchableOpacity>
            )}

            {/* Top Losers */}
            {topLosers.length > 0 && (
              <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => setFormulaModal('gainers')}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{t('investments.topLosers')}</Text>
                  <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
                </View>
                {topLosers.map((item) => (
                  <View key={item.symbol} style={styles.gainerRow}>
                    <Text style={styles.gainerSymbol}>{item.symbol}</Text>
                    <View style={styles.gainerBadge}>
                      <Ionicons name="arrow-down" size={14} color={theme.colors.danger} />
                      <Text style={[styles.gainerPercent, { color: theme.colors.danger }]}>
                        {item.pnlPercent.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                ))}
              </TouchableOpacity>
            )}

            {/* Benchmark Comparison */}
            <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => setFormulaModal('benchmark')}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{t('investments.benchmarkComparison')}</Text>
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
              </View>
                  {/* Benchmark selector */}
                  <View style={styles.benchmarkSelector}>
                    {BENCHMARKS.map((b) => (
                      <TouchableOpacity
                        key={b.symbol}
                        style={[
                          styles.benchmarkPill,
                          selectedBenchmark === b.symbol && styles.benchmarkPillActive,
                        ]}
                        onPress={() => setSelectedBenchmark(b.symbol)}
                      >
                        <Text
                          style={[
                            styles.benchmarkPillText,
                            selectedBenchmark === b.symbol && styles.benchmarkPillTextActive,
                          ]}
                        >
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {benchmarkLoading ? (
                    <View style={styles.placeholderChart}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    </View>
                  ) : benchmarkComparison.length > 0 ? (
                    <View style={styles.benchmarkResult}>
                      <View style={styles.benchmarkResultRow}>
                        <Text style={styles.benchmarkResultLabel}>{t('investments.yourPortfolio')}</Text>
                        <Text style={[styles.benchmarkResultValue, { color: benchmarkComparison[0].portfolioReturn >= 0 ? theme.colors.success : theme.colors.danger }]}>
                          {benchmarkComparison[0].portfolioReturn >= 0 ? '+' : ''}{benchmarkComparison[0].portfolioReturn.toFixed(2)}%
                        </Text>
                      </View>
                      <View style={styles.benchmarkResultRow}>
                        <Text style={styles.benchmarkResultLabel}>{BENCHMARKS.find(b => b.symbol === selectedBenchmark)?.name || selectedBenchmark}</Text>
                        <Text style={[styles.benchmarkResultValue, { color: benchmarkComparison[0].benchmarkReturn >= 0 ? theme.colors.success : theme.colors.danger }]}>
                          {benchmarkComparison[0].benchmarkReturn >= 0 ? '+' : ''}{benchmarkComparison[0].benchmarkReturn.toFixed(2)}%
                        </Text>
                      </View>
                      <View style={styles.benchmarkDiff}>
                        <Text style={styles.benchmarkDiffLabel}>{t('investments.difference')}</Text>
                        <Text style={[styles.benchmarkDiffValue, {
                          color: (benchmarkComparison[0].portfolioReturn - benchmarkComparison[0].benchmarkReturn) >= 0
                            ? theme.colors.success
                            : theme.colors.danger
                        }]}>
                          {(benchmarkComparison[0].portfolioReturn - benchmarkComparison[0].benchmarkReturn) >= 0 ? '+' : ''}
                          {(benchmarkComparison[0].portfolioReturn - benchmarkComparison[0].benchmarkReturn).toFixed(2)}%
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.placeholderChart}>
                      <Ionicons name="analytics-outline" size={40} color={theme.colors.textTertiary} />
                      <Text style={styles.placeholderText}>{t('investments.noBenchmarkData')}</Text>
                    </View>
                  )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {renderFormulaModal()}
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
  title: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[5],
  },
  insightsSection: {
    marginBottom: theme.spacing[5],
  },
  insightsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  insightsTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  periodSelector: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
    marginBottom: theme.spacing[5],
  },
  periodButton: {
    flex: 1,
    paddingVertical: theme.spacing[2.5],
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  periodButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  periodButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  periodButtonTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  loadingContainer: {
    padding: theme.spacing[12],
    alignItems: 'center' as const,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  performanceHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  performanceValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  returnBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing[1],
  },
  returnText: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
  },
  performanceTimeline: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[3],
  },
  timelineEntry: {
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  timelineDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  timelineValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  placeholderChart: {
    alignItems: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[2],
  },
  placeholderText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  allocationRow: {
    marginBottom: theme.spacing[3],
  },
  allocationInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  allocationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  allocationLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  allocationBarContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  allocationBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    overflow: 'hidden' as const,
  },
  allocationBarFill: {
    height: '100%' as const,
    borderRadius: 4,
  },
  allocationPercent: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    fontWeight: '600' as const,
    minWidth: 50,
    textAlign: 'right' as const,
  },
  gainerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  gainerSymbol: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  gainerBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  gainerPercent: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
  },
  proBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.warning + '20',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  proBadgeText: {
    ...theme.textStyles.caption,
    color: theme.colors.warning,
    fontWeight: '700' as const,
  },
  benchmarkRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  benchmarkName: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  benchmarkValues: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  benchmarkValue: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
  },
  benchmarkVs: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  benchmarkSelector: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  benchmarkPill: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['2xl'],
    backgroundColor: theme.colors.surfaceSecondary,
  },
  benchmarkPillActive: {
    backgroundColor: theme.colors.primary,
  },
  benchmarkPillText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    fontWeight: '600' as const,
  },
  benchmarkPillTextActive: {
    color: theme.colors.textInverse,
  },
  benchmarkResult: {
    gap: theme.spacing[2],
  },
  benchmarkResultRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  benchmarkResultLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  benchmarkResultValue: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
  benchmarkDiff: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    marginTop: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
  },
  benchmarkDiffLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  benchmarkDiffValue: {
    ...theme.textStyles.h3,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[4],
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    width: '100%' as const,
    maxWidth: 400,
    ...theme.shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  modalTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  modalClose: {
    padding: theme.spacing[1],
  },
  modalDescription: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[4],
    lineHeight: 22,
  },
  formulaBox: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  formulaLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  formulaText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
    fontFamily: 'monospace',
  },
  exampleBox: {
    backgroundColor: theme.colors.success + '10',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success,
  },
  exampleLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.success,
    marginBottom: theme.spacing[1],
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  exampleText: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
});
