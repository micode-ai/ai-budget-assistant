import React, { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useWalletStore } from '@/stores/walletStore';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { InteractiveLineChart } from '@/components/interactive-charts';
import { formatCurrency } from '@budget/shared-utils';
import type { ChartDataPoint } from '@budget/shared-types';

const PERIODS: Array<30 | 60 | 90> = [30, 60, 90];

function toBaseAmount(
  balances: Record<string, number>,
  baseCurrency: string,
  rates: Record<string, number>,
): number {
  let total = 0;
  for (const [currency, amount] of Object.entries(balances)) {
    if (currency === baseCurrency) {
      total += amount;
    } else {
      const rate = rates[currency];
      if (rate && rate !== 0) {
        total += amount / rate;
      } else {
        total += amount;
      }
    }
  }
  return total;
}

export function WalletSparklineCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { balanceHistory, selectedHistoryDays, isHistoryLoading, loadBalanceHistory, walletSummary } =
    useWalletStore();
  const baseCurrency = useAuthStore((s) => s.user?.currencyCode ?? 'USD');
  const rates = useExchangeRateStore((s) => s.rates);

  useEffect(() => {
    if (walletSummary.length > 0) {
      loadBalanceHistory(selectedHistoryDays);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletSummary.length]);

  const handlePeriodChange = useCallback(
    (days: 30 | 60 | 90) => {
      if (days !== selectedHistoryDays) {
        loadBalanceHistory(days);
      }
    },
    [selectedHistoryDays, loadBalanceHistory],
  );

  if (walletSummary.length === 0) return null;

  // Build chart data — one point per day converted to base currency
  // Subsample to at most 30 points for readability when period > 30 days
  const allPoints = balanceHistory.map((p) => ({
    value: toBaseAmount(p.balances, baseCurrency, rates),
    label: p.date.slice(5), // MM-DD
  })) as ChartDataPoint[];

  const step = allPoints.length > 30 ? Math.ceil(allPoints.length / 30) : 1;
  const chartPoints = allPoints.filter((_, i) => i % step === 0 || i === allPoints.length - 1);

  const firstValue = chartPoints[0]?.value ?? 0;
  const lastValue = chartPoints[chartPoints.length - 1]?.value ?? 0;
  const isPositiveTrend = lastValue >= firstValue;
  const lineColor = isPositiveTrend ? theme.colors.success : theme.colors.danger;

  const delta = lastValue - firstValue;
  const deltaSign = delta >= 0 ? '+' : '';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('wallet.balanceHistory')}</Text>
        <View style={styles.periodSelector}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodChip, selectedHistoryDays === p && { backgroundColor: theme.colors.primary }]}
              onPress={() => handlePeriodChange(p)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.periodChipText,
                  selectedHistoryDays === p && { color: '#fff' },
                ]}
              >
                {t('wallet.historyDays', { count: p })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isHistoryLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : chartPoints.length < 2 ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>{t('wallet.noHistoryYet')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.deltaRow}>
            <Text style={[styles.deltaText, { color: lineColor }]}>
              {deltaSign}
              {formatCurrency(Math.abs(delta), baseCurrency)}
            </Text>
            <Text style={styles.currentTotal}>{formatCurrency(lastValue, baseCurrency)}</Text>
          </View>
          <InteractiveLineChart
            data={chartPoints}
            height={90}
            lineColor={lineColor}
            areaChart
            animate={false}
            formatValue={(v) => formatCurrency(v, baseCurrency)}
          />
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  periodSelector: {
    flexDirection: 'row' as const,
    gap: theme.spacing[1],
  },
  periodChip: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  periodChipText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  loadingContainer: {
    height: 90,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  deltaRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    marginBottom: theme.spacing[2],
  },
  deltaText: {
    ...theme.textStyles.bodySmMedium,
  },
  currentTotal: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
});
