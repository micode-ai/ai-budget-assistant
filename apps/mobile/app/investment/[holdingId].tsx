import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { useState, useEffect, useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useAccountStore } from '@/stores/accountStore';
import { InteractiveLineChart } from '@/components/interactive-charts';
import { formatCurrency, formatPercentageChange } from '@budget/shared-utils';
import { useTheme, useStyles, fontSizes, type Theme } from '@/theme';
import type { Currency, ChartDataPoint } from '@budget/shared-types';

const ALLOCATION_COLORS = [
  '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
];

const CHART_PERIODS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
] as const;

export default function AssetDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { holdingId } = useLocalSearchParams<{ holdingId: string }>();
  const {
    holdings, transactions, assetPriceHistory, assetPriceLoading,
    loadTransactions, loadAssetPriceHistory, removeTransaction, removeHolding,
  } = useInvestmentStore();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const [chartPeriod, setChartPeriod] = useState(30);

  const currentAccount = accounts.find((a) => a.id === currentAccountId);
  const currency = (currentAccount?.currencyCode || 'USD') as Currency;

  const holding = holdings?.find((h: any) => h.id === holdingId);
  const holdingTransactions = transactions?.[holdingId || ''] || [];
  const priceHistory = holdingId ? assetPriceHistory[holdingId] : null;

  useEffect(() => {
    if (holdingId) {
      loadTransactions(holdingId);
      loadAssetPriceHistory(holdingId, chartPeriod);
    }
  }, [holdingId, loadTransactions, loadAssetPriceHistory, chartPeriod]);

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!priceHistory?.dates?.length) return [];
    const { dates, prices } = priceHistory;
    const step = Math.max(1, Math.floor(dates.length / 6));
    return dates.map((date, i) => ({
      label: i % step === 0
        ? new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '',
      value: prices[i] ?? 0,
    }));
  }, [priceHistory]);

  const handleDeleteTransaction = (transactionId: string) => {
    showAlert(
      t('investments.deleteTransaction'),
      t('investments.deleteTransactionConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            removeTransaction(transactionId, holdingId!);
          },
        },
      ]
    );
  };

  const handleDeleteHolding = () => {
    showAlert(
      t('investments.deleteHolding'),
      t('investments.deleteHoldingConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            removeHolding(holdingId!);
            router.back();
          },
        },
      ]
    );
  };

  if (!holding) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>{t('investments.holdingNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const avgCost = Number(holding.averageCostBasis) || 0;
  const livePrice = holding.asset?.currentPrice ? Number(holding.asset.currentPrice) : 0;
  // Fallback: use the most recent transaction price if no live price
  const lastTxPrice = holdingTransactions.length > 0
    ? Number(holdingTransactions[0]?.pricePerUnit) || 0
    : 0;
  const currentPrice = livePrice || lastTxPrice || avgCost;
  const hasLivePrice = livePrice > 0;
  const hasPrice = currentPrice > 0;
  const quantity = Number(holding.quantity) || 0;
  const priceCurrency = (holding.asset?.priceCurrency || currency) as Currency;
  const marketValue = quantity * currentPrice;
  const pnl = hasPrice ? marketValue - quantity * avgCost : 0;
  const pnlPercent = hasPrice && avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;
  const isPnlPositive = pnl >= 0;

  const statsData = [
    { label: t('investments.avgCost'), value: avgCost > 0 ? formatCurrency(avgCost, priceCurrency) : '—' },
    { label: t('investments.currentPrice'), value: hasPrice ? formatCurrency(currentPrice, priceCurrency) : '—', estimated: !hasLivePrice && hasPrice },
    { label: t('investments.quantity'), value: parseFloat(quantity.toPrecision(10)).toString() },
    { label: t('investments.marketValue'), value: hasPrice ? formatCurrency(marketValue, priceCurrency) : '—', estimated: !hasLivePrice && hasPrice },
    {
      label: t('investments.pnl'),
      value: hasPrice && avgCost > 0 ? `${isPnlPositive ? '+' : ''}${formatCurrency(Math.abs(pnl), priceCurrency)}` : '—',
      color: hasPrice && avgCost > 0 ? (isPnlPositive ? theme.colors.success : theme.colors.danger) : undefined,
    },
    {
      label: t('investments.pnlPercent'),
      value: hasPrice && avgCost > 0 ? formatPercentageChange(pnlPercent) : '—',
      color: hasPrice && avgCost > 0 ? (isPnlPositive ? theme.colors.success : theme.colors.danger) : undefined,
    },
  ];

  const holdingIndex = holdings?.findIndex((h: any) => h.id === holdingId) ?? 0;

  const renderTransaction = ({ item }: { item: any }) => {
    const isBuy = item.type === 'buy';
    const total = (item.quantity * item.pricePerUnit) + (item.fee || 0);

    return (
      <TouchableOpacity
        style={styles.transactionCard}
        onLongPress={() => handleDeleteTransaction(item.id)}
      >
        <View style={styles.transactionLeft}>
          <View style={styles.transactionHeader}>
            <View style={[styles.typeBadge, { backgroundColor: isBuy ? theme.colors.success + '20' : theme.colors.danger + '20' }]}>
              <Text style={[styles.typeBadgeText, { color: isBuy ? theme.colors.success : theme.colors.danger }]}>
                {isBuy ? t('investments.buy') : t('investments.sell')}
              </Text>
            </View>
            <Text style={styles.transactionDate}>
              {new Date(item.date).toLocaleDateString()}
            </Text>
          </View>
          <Text style={styles.transactionMeta}>
            {item.quantity} @ {formatCurrency(item.pricePerUnit, priceCurrency)}
          </Text>
        </View>
        <Text style={[styles.transactionTotal, { color: isBuy ? theme.colors.textPrimary : theme.colors.success }]}>
          {isBuy ? '-' : '+'}{formatCurrency(total, priceCurrency)}
        </Text>
      </TouchableOpacity>
    );
  };

  const ListHeaderComponent = () => (
    <View>
      {/* Asset Header */}
      <View style={styles.assetHeader}>
        {holding.asset?.logoUrl ? (
          <Image source={{ uri: holding.asset.logoUrl }} style={styles.assetLogo} />
        ) : (
          <View style={[styles.assetLogoFallback, {
            backgroundColor: ALLOCATION_COLORS[holdingIndex % ALLOCATION_COLORS.length] + '20',
          }]}>
            <Text style={[styles.assetLogoText, {
              color: ALLOCATION_COLORS[holdingIndex % ALLOCATION_COLORS.length],
            }]}>
              {(holding.asset?.symbol ?? '?').slice(0, 2)}
            </Text>
          </View>
        )}
        <View style={styles.assetInfo}>
          <Text style={styles.assetName} numberOfLines={1}>{holding.asset?.name ?? ''}</Text>
          <Text style={styles.assetMeta}>
            {holding.asset?.symbol ?? '—'}
            {holding.asset?.exchange ? ` · ${holding.asset.exchange}` : ''}
          </Text>
        </View>
      </View>

      {/* Price + P&L */}
      <View style={styles.priceSection}>
        <Text style={styles.priceValue}>
          {hasPrice ? formatCurrency(currentPrice, priceCurrency) : '—'}
        </Text>
        {!hasLivePrice && hasPrice && (
          <Text style={styles.estimatedPriceText}>~ {t('investments.lastTxPrice')}</Text>
        )}
        {hasPrice && avgCost > 0 ? (
          <View style={styles.pnlRow}>
            <Ionicons
              name={isPnlPositive ? 'arrow-up' : 'arrow-down'}
              size={16}
              color={isPnlPositive ? theme.colors.success : theme.colors.danger}
            />
            <Text style={[styles.pnlPercent, {
              color: isPnlPositive ? theme.colors.success : theme.colors.danger,
            }]}>
              {formatPercentageChange(pnlPercent)}
            </Text>
            <Text style={styles.pnlAbsolute}>
              ({isPnlPositive ? '+' : ''}{formatCurrency(Math.abs(pnl), priceCurrency)})
            </Text>
          </View>
        ) : null}
        {!hasPrice && (
          <Text style={styles.noPriceText}>{t('investments.noPriceData')}</Text>
        )}
      </View>

      {/* Price Chart */}
      <View style={styles.chartSection}>
        <View style={styles.periodSelector}>
          {CHART_PERIODS.map((p) => (
            <TouchableOpacity
              key={p.label}
              style={[styles.periodButton, chartPeriod === p.days && styles.periodButtonActive]}
              onPress={() => setChartPeriod(p.days)}
            >
              <Text style={[styles.periodButtonText,
                chartPeriod === p.days && styles.periodButtonTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {assetPriceLoading ? (
          <View style={styles.chartPlaceholder}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : chartData.length > 0 ? (
          <InteractiveLineChart
            data={chartData}
            height={160}
            formatValue={(v) => formatCurrency(v, priceCurrency)}
            lineColor={isPnlPositive ? theme.colors.success : theme.colors.danger}
            areaChart
          />
        ) : (
          <View style={styles.chartPlaceholder}>
            <Ionicons name="trending-up-outline" size={32} color={theme.colors.textTertiary} />
            <Text style={styles.chartPlaceholderText}>{t('investments.priceChartComingSoon')}</Text>
          </View>
        )}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {statsData.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={[styles.statValue, stat.color ? { color: stat.color } : undefined]}>
              {stat.value}
            </Text>
          </View>
        ))}
      </View>

      {/* Transactions Header */}
      <View style={styles.transactionsHeaderRow}>
        <Text style={styles.sectionTitle}>{t('investments.transactions')}</Text>
        {holdingTransactions.length > 0 && (
          <Text style={styles.transactionsCount}>{holdingTransactions.length}</Text>
        )}
      </View>
    </View>
  );

  const ListFooterComponent = () => (
    <View style={styles.footer}>
      <TouchableOpacity
        style={styles.addTransactionButton}
        onPress={() => router.push(`/investment/transaction?holdingId=${holdingId}`)}
      >
        <Ionicons name="add-circle-outline" size={22} color={theme.colors.textInverse} />
        <Text style={styles.addTransactionButtonText}>{t('investments.addTransaction')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteHolding}>
        <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
        <Text style={styles.deleteButtonText}>{t('investments.deleteHolding')}</Text>
      </TouchableOpacity>
    </View>
  );

  const EmptyTransactions = () => (
    <View style={styles.emptyTransactions}>
      <Ionicons name="swap-horizontal-outline" size={40} color={theme.colors.textTertiary} />
      <Text style={styles.emptyTransactionsText}>{t('investments.noTransactions')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        data={holdingTransactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        ListEmptyComponent={EmptyTransactions}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
    paddingBottom: 120, // Extra space for bottom navigation bar
  },

  // Asset Header
  assetHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  assetLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: theme.spacing[3],
  },
  assetLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: theme.spacing[3],
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  assetLogoText: {
    ...theme.textStyles.h3,
    fontWeight: '700' as const,
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  assetMeta: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },

  // Price Section
  priceSection: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  priceValue: {
    fontFamily: theme.fonts.bold,
    fontSize: fontSizes['4xl'],
    color: theme.colors.textPrimary,
  },
  pnlRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
  },
  pnlPercent: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
  pnlAbsolute: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  noPriceText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
  estimatedPriceText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },

  // Chart
  chartSection: {
    marginBottom: theme.spacing[5],
  },
  periodSelector: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
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
    height: 160,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    ...theme.shadows.sm,
  },
  chartPlaceholderText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[5],
  },
  statCard: {
    width: '47%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    ...theme.shadows.sm,
  },
  statLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  statValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },

  // Transactions
  transactionsHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  transactionsCount: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden' as const,
  },
  transactionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    ...theme.shadows.sm,
  },
  transactionLeft: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  transactionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  typeBadge: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.borderRadius.md,
  },
  typeBadgeText: {
    ...theme.textStyles.caption,
    fontWeight: '700' as const,
  },
  transactionDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  transactionMeta: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  transactionTotal: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  separator: {
    height: theme.spacing[2],
  },

  // Footer
  footer: {
    marginTop: theme.spacing[5],
    gap: theme.spacing[3],
  },
  addTransactionButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
  },
  addTransactionButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  deleteButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  deleteButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.danger,
  },

  // Empty States
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[8],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[3],
  },
  emptyTransactions: {
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  emptyTransactionsText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
});
