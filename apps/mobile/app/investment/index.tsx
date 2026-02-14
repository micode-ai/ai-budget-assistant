import { View, Text, FlatList, TouchableOpacity, RefreshControl, Image, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { InteractiveLineChart } from '@/components/interactive-charts';
import { formatCurrency, formatPercentageChange } from '@budget/shared-utils';
import { useTheme, useStyles, fontSizes, type Theme } from '@/theme';
import type { Currency, ChartDataPoint } from '@budget/shared-types';

const ALLOCATION_COLORS = [
  '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
];

const PERIODS = ['1W', '1M', '3M', '1Y', 'All'] as const;
const PERIOD_MAP: Record<string, string> = {
  '1W': 'week', '1M': 'month', '3M': 'quarter', '1Y': 'year', 'All': 'all',
};

export default function InvestmentDashboardScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const {
    holdings, summary, performanceData, performanceLoading,
    loadHoldings, loadSummary, loadPerformance, refreshPrices,
  } = useInvestmentStore();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const userCurrency = useAuthStore((s) => s.user?.currencyCode || 'USD') as Currency;
  const { rates, loadRates } = useExchangeRateStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('1M');

  // Portfolio values are in USD, convert to user's display currency
  const displayCurrency = userCurrency;
  const convert = useCallback(
    (amount: number, fromCurrency: string = 'USD') =>
      convertAmount(amount, fromCurrency, displayCurrency, rates),
    [rates, displayCurrency],
  );

  useEffect(() => {
    loadHoldings();
    loadSummary();
    loadRates();
  }, [loadHoldings, loadSummary, loadRates, currentAccountId]);

  useEffect(() => {
    if (holdings && holdings.length > 0) {
      loadPerformance(PERIOD_MAP[selectedPeriod]);
    }
  }, [selectedPeriod, holdings?.length, loadPerformance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadHoldings(), loadSummary()]);
      await loadPerformance(PERIOD_MAP[selectedPeriod]);
    } finally {
      setRefreshing(false);
    }
  }, [loadHoldings, loadSummary, loadPerformance, selectedPeriod]);

  const totalPnl = summary?.totalPnL ?? 0;
  const totalValue = summary?.totalValue ?? 0;
  const totalPnlPercent = summary?.totalPnLPercent ?? 0;
  const isPositive = totalPnl >= 0;

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!performanceData?.dates?.length) return [];
    const dates = performanceData.dates;
    const values = performanceData.values;
    const step = Math.max(1, Math.floor(dates.length / 6));
    return dates.map((date, i) => ({
      label: i % step === 0
        ? new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '',
      value: values[i] ?? 0,
    }));
  }, [performanceData]);

  const renderHoldingItem = ({ item, index }: { item: any; index: number }) => {
    const qty = Number(item.quantity) || 0;
    const avgCost = Number(item.averageCostBasis) || 0;
    const livePrice = item.asset?.currentPrice ? Number(item.asset.currentPrice) : 0;
    // Fallback to avg cost when no live price available
    const curPrice = livePrice || avgCost;
    const hasPrice = curPrice > 0;
    const hasLivePrice = livePrice > 0;
    const marketVal = qty * curPrice;
    const pnlPercent = hasPrice && avgCost > 0 ? ((curPrice - avgCost) / avgCost) * 100 : 0;
    const isPnlPositive = pnlPercent >= 0;
    const priceCurrency = (item.asset?.priceCurrency || 'USD') as Currency;

    return (
      <TouchableOpacity
        style={styles.holdingRow}
        onPress={() => router.push(`/investment/${item.id}`)}
      >
        {item.asset?.logoUrl ? (
          <Image source={{ uri: item.asset.logoUrl }} style={styles.holdingLogo} />
        ) : (
          <View style={[styles.holdingLogoFallback, {
            backgroundColor: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] + '20',
          }]}>
            <Text style={[styles.holdingLogoText, {
              color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
            }]}>
              {(item.asset?.symbol ?? '?').slice(0, 2)}
            </Text>
          </View>
        )}

        <View style={styles.holdingCenter}>
          <Text style={styles.holdingName} numberOfLines={1}>{item.asset?.name ?? ''}</Text>
          <Text style={styles.holdingMeta}>
            {parseFloat(qty.toPrecision(10))} {item.asset?.symbol}
            {hasPrice ? ` · ${hasLivePrice ? '' : '~'}${formatCurrency(convert(curPrice, priceCurrency), displayCurrency)}` : ''}
          </Text>
        </View>

        <View style={styles.holdingRight}>
          <Text style={styles.holdingValue}>
            {hasPrice ? `${hasLivePrice ? '' : '~'}${formatCurrency(convert(marketVal, priceCurrency), displayCurrency)}` : '—'}
          </Text>
          {hasPrice && avgCost > 0 && hasLivePrice ? (
            <Text style={[styles.holdingPnlPercent, {
              color: isPnlPositive ? theme.colors.success : theme.colors.danger,
            }]}>
              {formatPercentageChange(pnlPercent)}
            </Text>
          ) : hasPrice && !hasLivePrice ? (
            <Text style={[styles.holdingPnlPercent, { color: theme.colors.textTertiary }]}>
              ~ {t('investments.lastTxPrice')}
            </Text>
          ) : (
            <Text style={[styles.holdingPnlPercent, { color: theme.colors.textTertiary }]}>
              {t('investments.noPriceData')}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="trending-up-outline" size={64} color={theme.colors.textTertiary} />
      <Text style={styles.emptyTitle}>{t('investments.noHoldings')}</Text>
      <Text style={styles.emptySubtitle}>{t('investments.noHoldingsSubtitle')}</Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/investment/search')}
      >
        <Text style={styles.addButtonText}>{t('investments.addAsset')}</Text>
      </TouchableOpacity>
    </View>
  );

  const ListHeaderComponent = () => (
    <View>
      {/* Hero Section */}
      <View style={styles.heroSection}>
        <Text style={styles.heroLabel}>{t('investments.portfolio')}</Text>
        <Text style={styles.heroValue}>
          {formatCurrency(convert(totalValue), displayCurrency)}
        </Text>
        <View style={styles.heroPnlRow}>
          <Ionicons
            name={isPositive ? 'arrow-up' : 'arrow-down'}
            size={16}
            color={isPositive ? theme.colors.success : theme.colors.danger}
          />
          <Text style={[styles.heroPnlPercent, {
            color: isPositive ? theme.colors.success : theme.colors.danger,
          }]}>
            {formatPercentageChange(totalPnlPercent)}
          </Text>
          <Text style={styles.heroPnlAbsolute}>
            ({isPositive ? '+' : ''}{formatCurrency(convert(Math.abs(totalPnl)), displayCurrency)})
          </Text>
        </View>
      </View>

      {/* Performance Chart */}
      {holdings && holdings.length > 0 && (
        <View style={styles.chartSection}>
          <View style={styles.periodSelector}>
            {PERIODS.map((period) => (
              <TouchableOpacity
                key={period}
                style={[styles.periodButton, selectedPeriod === period && styles.periodButtonActive]}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text style={[styles.periodButtonText,
                  selectedPeriod === period && styles.periodButtonTextActive]}>
                  {period}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {performanceLoading ? (
            <View style={styles.chartPlaceholder}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : chartData.length > 0 ? (
            <InteractiveLineChart
              data={chartData}
              height={180}
              formatValue={(v) => formatCurrency(convert(v), displayCurrency)}
              lineColor={isPositive ? theme.colors.success : theme.colors.danger}
              areaChart
            />
          ) : (
            <View style={styles.chartPlaceholder}>
              <Ionicons name="analytics-outline" size={32} color={theme.colors.textTertiary} />
              <Text style={styles.chartPlaceholderText}>{t('investments.noPerformanceData')}</Text>
            </View>
          )}
        </View>
      )}

      {/* Action Buttons */}
      {holdings && holdings.length > 0 && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/investment/search')}>
            <View style={styles.actionIconCircle}>
              <Ionicons name="add-outline" size={22} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>{t('investments.addAsset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/investment/analytics')}>
            <View style={styles.actionIconCircle}>
              <Ionicons name="analytics-outline" size={22} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>{t('investments.analytics')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => refreshPrices()}>
            <View style={styles.actionIconCircle}>
              <Ionicons name="refresh-outline" size={22} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>{t('investments.refreshPrices')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Holdings Header */}
      {holdings && holdings.length > 0 && (
        <View style={styles.holdingsHeader}>
          <Text style={styles.sectionTitle}>{t('investments.holdings')}</Text>
          <Text style={styles.holdingsCount}>{holdings.length}</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        data={holdings}
        renderItem={renderHoldingItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={EmptyComponent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* FAB */}
      {holdings && holdings.length > 0 && (
        <View style={styles.fabContainer}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => router.push('/investment/search')}
            activeOpacity={0.9}
          >
            <Ionicons name="add" size={28} color={theme.colors.textInverse} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: theme.spacing[4],
    paddingBottom: 100,
    flexGrow: 1 as const,
  },

  // Hero
  heroSection: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[5],
  },
  heroLabel: {
    ...theme.textStyles.h3,
    color: theme.colors.textSecondary,
  },
  heroValue: {
    fontFamily: theme.fonts.bold,
    fontSize: fontSizes['5xl'],
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[2],
  },
  heroPnlRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
  },
  heroPnlPercent: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
  heroPnlAbsolute: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },

  // Chart
  chartSection: {
    marginBottom: theme.spacing[4],
  },
  periodSelector: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  periodButton: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['2xl'],
    backgroundColor: theme.colors.surface,
  },
  periodButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  periodButtonText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    fontWeight: '600' as const,
  },
  periodButtonTextActive: {
    color: theme.colors.textInverse,
  },
  chartPlaceholder: {
    height: 180,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  chartPlaceholderText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },

  // Action Buttons
  actionRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    paddingVertical: theme.spacing[4],
    marginBottom: theme.spacing[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  actionButton: {
    alignItems: 'center' as const,
    flex: 1,
  },
  actionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  actionLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
    textAlign: 'center' as const,
  },

  // Holdings
  holdingsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  holdingsCount: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden' as const,
  },
  holdingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  holdingLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: theme.spacing[3],
  },
  holdingLogoFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: theme.spacing[3],
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  holdingLogoText: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
  },
  holdingCenter: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  holdingName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  holdingMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  holdingRight: {
    alignItems: 'flex-end' as const,
  },
  holdingValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  holdingPnlPercent: {
    ...theme.textStyles.caption,
    fontWeight: '500' as const,
    marginTop: theme.spacing[0.5],
  },
  separator: {
    height: theme.spacing[2],
  },

  // Empty
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[8],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[4],
  },
  emptySubtitle: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[6],
  },
  addButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius['2xl'],
  },
  addButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },

  // FAB
  fabContainer: {
    position: 'absolute' as const,
    right: theme.spacing[5],
    bottom: 50,
    alignItems: 'flex-end' as const,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    ...theme.shadows.xl,
  },
});
