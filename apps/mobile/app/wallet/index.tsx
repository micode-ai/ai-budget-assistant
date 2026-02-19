import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '@/stores/walletStore';
import { useAccountStore } from '@/stores/accountStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@budget/shared-utils';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';

export default function WalletScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  const { walletSummary, exchanges, transfers, loadWallet } = useWalletStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const accounts = useAccountStore((s) => s.accounts);
  const { rates } = useExchangeRateStore();
  const userCurrency = useAuthStore((s) => s.user?.currencyCode || 'USD');
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const hasMultipleCurrencies = walletSummary.length > 1;
  const hasRates = Object.keys(rates).length > 0;
  const totalBalanceInUserCurrency = hasMultipleCurrencies && hasRates
    ? walletSummary.reduce((sum, s) => {
        if (s.currencyCode === userCurrency) return sum + s.currentBalance;
        const rate = rates[s.currencyCode];
        if (!rate || rate === 0) return sum + s.currentBalance;
        return sum + s.currentBalance / rate;
      }, 0)
    : 0;

  useEffect(() => {
    loadWallet();
    useExchangeRateStore.getState().loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadWallet();
    } finally {
      setRefreshing(false);
    }
  }, [loadWallet]);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>{t('wallet.title')}</Text>

        {walletSummary.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={64} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>{t('wallet.noBalances')}</Text>
            <Text style={styles.emptySubtitle}>{t('wallet.noBalancesHint')}</Text>
            {canEdit && (
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/wallet/set-balance')}>
                <Text style={styles.primaryButtonText}>{t('wallet.addBalance')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('wallet.balances')}</Text>
              {hasMultipleCurrencies && hasRates && (
                <View style={styles.totalBalanceCard}>
                  <Text style={styles.totalBalanceLabel}>
                    {t('wallet.totalBalance', { currency: userCurrency })}
                  </Text>
                  <Text style={[styles.totalBalanceAmount, totalBalanceInUserCurrency < 0 && { color: '#FF6B6B' }]}>
                    {formatCurrency(totalBalanceInUserCurrency, userCurrency)}
                  </Text>
                </View>
              )}
              {walletSummary.map((summary) => (
                <View key={summary.currencyCode} style={styles.balanceCard}>
                  <View style={styles.balanceHeader}>
                    <Text style={styles.currencyCode}>{summary.currencyCode}</Text>
                    <Text style={[styles.currentBalance, summary.currentBalance < 0 && { color: theme.colors.danger }]}>
                      {formatCurrency(summary.currentBalance, summary.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.balanceDetails}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('wallet.initialBalance')}</Text>
                      <Text style={styles.detailValue}>{formatCurrency(summary.initialAmount, summary.currencyCode)}</Text>
                    </View>
                    {summary.totalIncomes > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{t('wallet.totalIncome')}</Text>
                        <Text style={[styles.detailValue, { color: theme.colors.success }]}>
                          +{formatCurrency(summary.totalIncomes, summary.currencyCode)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('wallet.totalSpent')}</Text>
                      <Text style={[styles.detailValue, { color: theme.colors.danger }]}>
                        -{formatCurrency(summary.totalExpenses, summary.currencyCode)}
                      </Text>
                    </View>
                    {summary.totalExchangedIn > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{t('wallet.exchangedIn')}</Text>
                        <Text style={[styles.detailValue, { color: theme.colors.success }]}>
                          +{formatCurrency(summary.totalExchangedIn, summary.currencyCode)}
                        </Text>
                      </View>
                    )}
                    {summary.totalExchangedOut > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{t('wallet.exchangedOut')}</Text>
                        <Text style={[styles.detailValue, { color: theme.colors.warning }]}>
                          -{formatCurrency(summary.totalExchangedOut, summary.currencyCode)}
                        </Text>
                      </View>
                    )}
                    {summary.totalTransferredIn > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{t('wallet.transferredIn')}</Text>
                        <Text style={[styles.detailValue, { color: theme.colors.success }]}>
                          +{formatCurrency(summary.totalTransferredIn, summary.currencyCode)}
                        </Text>
                      </View>
                    )}
                    {summary.totalTransferredOut > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{t('wallet.transferredOut')}</Text>
                        <Text style={[styles.detailValue, { color: theme.colors.warning }]}>
                          -{formatCurrency(summary.totalTransferredOut, summary.currencyCode)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {canEdit && (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/wallet/set-balance')}>
                  <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.actionButtonText}>{t('wallet.setInitialBalance')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/wallet/exchange')}>
                  <Ionicons name="swap-horizontal" size={20} color={theme.colors.primary} />
                  <Text style={styles.actionButtonText}>{t('exchange.title')}</Text>
                </TouchableOpacity>
                {accounts.length > 1 && (
                  <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/wallet/transfer')}>
                    <Ionicons name="arrow-forward-circle-outline" size={20} color={theme.colors.primary} />
                    <Text style={styles.actionButtonText}>{t('transfer.title')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {exchanges.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('exchange.recentExchanges')}</Text>
                {exchanges.slice(0, 10).map((exchange) => (
                  <View key={exchange.id} style={styles.exchangeItem}>
                    <View style={styles.exchangeInfo}>
                      <Text style={styles.exchangeDirection}>
                        {exchange.fromCurrency} → {exchange.toCurrency}
                      </Text>
                      <Text style={styles.exchangeDate}>
                        {new Date(exchange.date).toLocaleDateString(getIntlLocale())}
                      </Text>
                    </View>
                    <View style={styles.exchangeAmounts}>
                      <Text style={styles.exchangeFromAmount}>
                        -{formatCurrency(exchange.fromAmount, exchange.fromCurrency)}
                      </Text>
                      <Text style={styles.exchangeToAmount}>
                        +{formatCurrency(exchange.toAmount, exchange.toCurrency)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {transfers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('transfer.recentTransfers')}</Text>
                {transfers.slice(0, 10).map((transfer) => {
                  const fromAccount = accounts.find((a) => a.id === transfer.fromAccountId);
                  const toAccount = accounts.find((a) => a.id === transfer.toAccountId);
                  return (
                    <TouchableOpacity
                      key={transfer.id}
                      style={styles.exchangeItem}
                      onPress={() => router.push({ pathname: '/wallet/[id]', params: { id: transfer.id } })}
                    >
                      <View style={styles.exchangeInfo}>
                        <Text style={styles.exchangeDirection}>
                          {fromAccount?.name || '...'} → {toAccount?.name || '...'}
                        </Text>
                        <Text style={styles.exchangeDate}>
                          {new Date(transfer.date).toLocaleDateString(getIntlLocale())}
                        </Text>
                      </View>
                      <View style={styles.exchangeAmounts}>
                        <Text style={styles.exchangeFromAmount}>
                          -{formatCurrency(transfer.fromAmount, transfer.fromCurrency)}
                        </Text>
                        <Text style={styles.exchangeToAmount}>
                          +{formatCurrency(transfer.toAmount, transfer.toCurrency)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
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
    marginBottom: theme.spacing[6],
  },
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  totalBalanceCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    alignItems: 'center' as const,
  },
  totalBalanceLabel: {
    ...theme.textStyles.bodySmMedium,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: theme.spacing[1],
  },
  totalBalanceAmount: {
    ...theme.textStyles.h1,
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center' as const,
    padding: theme.spacing[8],
  },
  emptyTitle: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
  },
  emptySubtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
    textAlign: 'center' as const,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    marginTop: theme.spacing[4],
  },
  primaryButtonText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: '#FFFFFF',
  },
  balanceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[3],
    ...theme.shadows.md,
  },
  balanceHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  currencyCode: {
    ...theme.textStyles.h3,
    color: theme.colors.textSecondary,
  },
  currentBalance: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  balanceDetails: {
    gap: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[3],
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  detailLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  detailValue: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  actions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[6],
  },
  actionButton: {
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1.5],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.primary,
    minWidth: 100,
    flex: 1,
  },
  actionButtonText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    textAlign: 'center' as const,
  },
  exchangeItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  exchangeInfo: {
    flex: 1,
  },
  exchangeDirection: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  exchangeDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  exchangeAmounts: {
    alignItems: 'flex-end' as const,
  },
  exchangeFromAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.danger,
  },
  exchangeToAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.success,
    marginTop: theme.spacing[1],
  },
});
