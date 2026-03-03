import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

export function NetCapitalWidget() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuthStore();
  const walletSummary = useWalletStore((s) => s.walletSummary);
  const rates = useExchangeRateStore((s) => s.rates);
  const baseCurrency = useExchangeRateStore((s) => s.baseCurrency);
  const currency = (baseCurrency || user?.currencyCode || 'USD') as Currency;

  const header = (
    <View style={styles.headerRow}>
      <Ionicons name="wallet-outline" size={20} color={theme.colors.primary} />
      <Text style={styles.cardTitle}>{t('dashboard.netCapital')}</Text>
    </View>
  );

  if (walletSummary.length === 0) {
    return (
      <View style={styles.card}>
        {header}
        <View style={styles.emptyContainer}>
          <Ionicons name="wallet-outline" size={32} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>{t('wallet.noBalances')}</Text>
        </View>
      </View>
    );
  }

  const totalNetCapital = walletSummary.reduce(
    (sum, s) => sum + convertAmount(s.currentBalance, s.currencyCode, currency, rates),
    0,
  );
  const isPositive = totalNetCapital >= 0;
  const amountColor = isPositive ? theme.colors.success : theme.colors.danger;

  return (
    <View style={styles.card}>
      {header}
      <Text style={styles.subtitle}>{t('dashboard.netCapitalSubtitle')}</Text>
      <Text style={[styles.mainAmount, { color: amountColor }]}>
        {isPositive ? '+' : ''}{formatCurrency(totalNetCapital, currency)}
      </Text>

      <View style={styles.breakdownContainer}>
        {walletSummary.map((s) => (
          <View key={s.currencyCode} style={styles.breakdownRow}>
            <Text style={styles.breakdownCurrency}>{s.currencyCode}</Text>
            <Text
              style={[
                styles.breakdownAmount,
                s.currentBalance < 0 && { color: theme.colors.danger },
              ]}
            >
              {formatCurrency(s.currentBalance, s.currencyCode as Currency)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  cardTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  mainAmount: {
    ...theme.textStyles.h2,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  breakdownContainer: {
    gap: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: theme.spacing[3],
  },
  breakdownRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  breakdownCurrency: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  breakdownAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  emptyContainer: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[5],
    gap: theme.spacing[2],
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
