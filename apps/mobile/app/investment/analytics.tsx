import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import { useTheme, useStyles, type Theme } from '@/theme';

type Period = '1W' | '1M' | '3M' | '1Y' | 'All';

interface PortfolioAnalytics {
  performanceHistory: { date: string; value: number }[];
  allocation: { type: string; percentage: number; color: string }[];
  topGainers: { symbol: string; pnlPercent: number }[];
  topLosers: { symbol: string; pnlPercent: number }[];
  benchmarkComparison?: { name: string; portfolioReturn: number; benchmarkReturn: number }[];
}

const PERIODS: Period[] = ['1W', '1M', '3M', '1Y', 'All'];

export default function PortfolioAnalyticsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('1M');
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [selectedPeriod]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const data = await api.getPortfolioAnalytics(selectedPeriod);
      setAnalytics(data);
    } catch (e) {
      console.log('Failed to fetch portfolio analytics:', e);
    } finally {
      setLoading(false);
    }
  };

  const performanceHistory = analytics?.performanceHistory || [];
  const allocation = analytics?.allocation || [];
  const topGainers = analytics?.topGainers || [];
  const topLosers = analytics?.topLosers || [];
  const benchmarkComparison = analytics?.benchmarkComparison || [];

  const latestValue = performanceHistory.length > 0 ? performanceHistory[performanceHistory.length - 1].value : 0;
  const earliestValue = performanceHistory.length > 0 ? performanceHistory[0].value : 0;
  const periodReturn = earliestValue > 0 ? ((latestValue - earliestValue) / earliestValue) * 100 : 0;
  const isPeriodPositive = periodReturn >= 0;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('investments.analytics')}</Text>

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
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('investments.performance')}</Text>
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
            </View>

            {/* Allocation Section */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('investments.allocationByType')}</Text>
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
            </View>

            {/* Top Gainers */}
            {topGainers.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('investments.topGainers')}</Text>
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
              </View>
            )}

            {/* Top Losers */}
            {topLosers.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('investments.topLosers')}</Text>
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
              </View>
            )}

            {/* Benchmark Comparison (Pro+) */}
            <View style={styles.card}>
              <View style={styles.benchmarkHeader}>
                <Text style={styles.cardTitle}>{t('investments.benchmarkComparison')}</Text>
                <View style={styles.proBadge}>
                  <Ionicons name="star" size={12} color={theme.colors.warning} />
                  <Text style={styles.proBadgeText}>Pro+</Text>
                </View>
              </View>
              {benchmarkComparison.length > 0 ? (
                benchmarkComparison.map((item) => (
                  <View key={item.name} style={styles.benchmarkRow}>
                    <Text style={styles.benchmarkName}>{item.name}</Text>
                    <View style={styles.benchmarkValues}>
                      <Text style={[styles.benchmarkValue, { color: item.portfolioReturn >= 0 ? theme.colors.success : theme.colors.danger }]}>
                        {item.portfolioReturn >= 0 ? '+' : ''}{item.portfolioReturn.toFixed(2)}%
                      </Text>
                      <Text style={styles.benchmarkVs}>vs</Text>
                      <Text style={[styles.benchmarkValue, { color: item.benchmarkReturn >= 0 ? theme.colors.success : theme.colors.danger }]}>
                        {item.benchmarkReturn >= 0 ? '+' : ''}{item.benchmarkReturn.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.placeholderChart}>
                  <Ionicons name="lock-closed-outline" size={40} color={theme.colors.textTertiary} />
                  <Text style={styles.placeholderText}>{t('investments.benchmarkProOnly')}</Text>
                </View>
              )}
            </View>
          </>
        )}
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
  title: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[5],
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
  benchmarkHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
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
});
