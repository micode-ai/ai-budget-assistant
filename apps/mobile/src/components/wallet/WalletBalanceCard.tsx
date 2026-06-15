import React, { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useWalletStore } from '@/stores/walletStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { WalletMonthlyChart, type MonthlyDeltaBar } from './WalletMonthlyChart';

const MONTH_WINDOWS: Array<6 | 12> = [6, 12];

function convertBalances(
  balances: Record<string, number>,
  toCurrency: string,
  rates: Record<string, number>,
): number {
  let total = 0;
  for (const [currency, amount] of Object.entries(balances)) {
    total += convertAmount(amount, currency, toCurrency, rates);
  }
  return total;
}

/** 'YYYY-MM' -> localized short month label, e.g. 'Jun'. */
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString(getIntlLocale(), { month: 'short' });
}

interface Props {
  displayCurrency: string;
}

export function WalletBalanceCard({ displayCurrency }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { monthlyHistory, selectedMonths, isHistoryLoading, loadMonthlyHistory, walletSummary } =
    useWalletStore();
  const rates = useExchangeRateStore((s) => s.rates);

  useEffect(() => {
    if (walletSummary.length > 0) {
      loadMonthlyHistory(selectedMonths);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletSummary.length]);

  const handleWindowChange = useCallback(
    (months: 6 | 12) => {
      if (months !== selectedMonths) loadMonthlyHistory(months);
    },
    [selectedMonths, loadMonthlyHistory],
  );

  if (walletSummary.length === 0) return null;

  const bars: MonthlyDeltaBar[] = monthlyHistory.map((p) => ({
    month: p.month,
    label: monthLabel(p.month),
    value: convertBalances(p.deltas, displayCurrency, rates),
  }));

  const latest = bars[bars.length - 1];
  const latestValue = latest?.value ?? 0;
  const latestColor = latestValue >= 0 ? theme.colors.success : theme.colors.danger;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('wallet.balanceHistory')}</Text>
        <View style={styles.periodSelector}>
          {MONTH_WINDOWS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.periodChip, selectedMonths === m && { backgroundColor: theme.colors.primary }]}
              onPress={() => handleWindowChange(m)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodChipText, selectedMonths === m && { color: '#fff' }]}>
                {t('wallet.monthsWindow', { count: m })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isHistoryLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : bars.length < 1 ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>{t('wallet.noHistoryYet')}</Text>
        </View>
      ) : (
        <>
          {latest && (
            <View style={styles.deltaRow}>
              <Text style={[styles.deltaText, { color: latestColor }]}>
                {latestValue >= 0 ? '+' : ''}
                {formatCurrency(latestValue, displayCurrency)}
              </Text>
              <Text style={styles.deltaMonth}>{t('wallet.monthlyChange', { month: latest.label })}</Text>
            </View>
          )}
          <WalletMonthlyChart data={bars} formatValue={(v) => formatCurrency(v, displayCurrency)} />
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
    height: 120,
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
    ...theme.textStyles.bodyLargeSemiBold,
  },
  deltaMonth: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
});
