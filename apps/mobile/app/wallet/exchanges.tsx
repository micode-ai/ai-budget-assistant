import { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useWalletStore } from '@/stores/walletStore';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { CurrencyExchange, Currency } from '@budget/shared-types';

type PeriodFilter = 'all' | 'this_month' | 'last_3_months' | 'this_year';

export default function ExchangeHistoryScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();

  const { exchanges, loadWallet, isLoading } = useWalletStore();

  const [refreshing, setRefreshing] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState<Currency | 'all'>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadWallet();
    } finally {
      setRefreshing(false);
    }
  }, [loadWallet]);

  const activeExchanges = useMemo(
    () => exchanges.filter((e) => !e.isDeleted),
    [exchanges],
  );

  const availableCurrencies = useMemo(() => {
    const currencySet = new Set<Currency>();
    for (const e of activeExchanges) {
      currencySet.add(e.fromCurrency);
      currencySet.add(e.toCurrency);
    }
    return Array.from(currencySet).sort();
  }, [activeExchanges]);

  const filteredExchanges = useMemo(() => {
    let result = activeExchanges;

    // Currency filter
    if (currencyFilter !== 'all') {
      result = result.filter(
        (e) => e.fromCurrency === currencyFilter || e.toCurrency === currencyFilter,
      );
    }

    // Period filter
    if (periodFilter !== 'all') {
      const now = new Date();
      let cutoff: Date;

      switch (periodFilter) {
        case 'this_month':
          cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'last_3_months':
          cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          break;
        case 'this_year':
          cutoff = new Date(now.getFullYear(), 0, 1);
          break;
      }

      result = result.filter((e) => {
        const date = e.date instanceof Date ? e.date : new Date(e.date);
        return date >= cutoff;
      });
    }

    // Sort by date descending
    return [...result].sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
      const dateB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
      return dateB - dateA;
    });
  }, [activeExchanges, currencyFilter, periodFilter]);

  const formatDate = useCallback(
    (date: Date | string) => {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    },
    [locale],
  );

  const currencyFilters: { key: Currency | 'all'; label: string }[] = useMemo(
    () => [
      { key: 'all', label: t('exchange.allCurrencies') },
      ...availableCurrencies.map((c) => ({ key: c, label: c })),
    ],
    [availableCurrencies, t],
  );

  const periodFilters: { key: PeriodFilter; label: string }[] = [
    { key: 'all', label: t('exchange.allTime') },
    { key: 'this_month', label: t('exchange.thisMonth') },
    { key: 'last_3_months', label: t('exchange.last3Months') },
    { key: 'this_year', label: t('exchange.thisYear') },
  ];

  const renderCurrencyFilters = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
    >
      {currencyFilters.map((filter) => (
        <TouchableOpacity
          key={filter.key}
          style={[styles.filterChip, currencyFilter === filter.key && styles.filterChipActive]}
          onPress={() => setCurrencyFilter(filter.key)}
        >
          <Text
            style={[
              styles.filterChipText,
              currencyFilter === filter.key && styles.filterChipTextActive,
            ]}
          >
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderPeriodFilters = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
    >
      {periodFilters.map((filter) => (
        <TouchableOpacity
          key={filter.key}
          style={[styles.filterChip, periodFilter === filter.key && styles.filterChipActive]}
          onPress={() => setPeriodFilter(filter.key)}
        >
          <Text
            style={[
              styles.filterChipText,
              periodFilter === filter.key && styles.filterChipTextActive,
            ]}
          >
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderExchangeItem = ({ item }: { item: CurrencyExchange }) => (
    <View style={styles.exchangeCard}>
      <View style={styles.exchangeHeader}>
        <View style={styles.currencyPair}>
          <Text style={styles.currencyPairText}>
            {item.fromCurrency} → {item.toCurrency}
          </Text>
          <Text style={styles.exchangeRate}>
            1 {item.fromCurrency} = {item.exchangeRate.toFixed(4)} {item.toCurrency}
          </Text>
        </View>
        <Text style={styles.exchangeDate}>{formatDate(item.date)}</Text>
      </View>

      <View style={styles.amountsRow}>
        <View style={styles.amountBlock}>
          <Text style={[styles.amountValue, { color: theme.colors.danger }]}>
            -{formatCurrency(item.fromAmount, item.fromCurrency)}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={theme.colors.textTertiary} />
        <View style={styles.amountBlock}>
          <Text style={[styles.amountValue, { color: theme.colors.success }]}>
            +{formatCurrency(item.toAmount, item.toCurrency)}
          </Text>
        </View>
      </View>

      {item.notes ? (
        <Text style={styles.notes} numberOfLines={2}>
          {item.notes}
        </Text>
      ) : null}
    </View>
  );

  const ListHeaderComponent = () => (
    <View>
      {renderCurrencyFilters()}
      {renderPeriodFilters()}
    </View>
  );

  const ListEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="swap-horizontal-outline" size={64} color={theme.colors.textDisabled} />
      <Text style={styles.emptyTitle}>{t('exchange.noExchanges')}</Text>
      <Text style={styles.emptySubtitle}>{t('exchange.noExchangesHint')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        data={filteredExchanges}
        renderItem={renderExchangeItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />
        }
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
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
    paddingBottom: theme.spacing[4],
    flexGrow: 1,
  },

  // Filter chips
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: theme.spacing[3],
  },
  filterRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  filterChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['3xl'],
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  filterChipTextActive: {
    color: theme.colors.primary,
  },

  // Exchange card
  exchangeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  exchangeHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: theme.spacing[3],
  },
  currencyPair: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  currencyPairText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  exchangeRate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  exchangeDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },

  // Amounts
  amountsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  amountBlock: {
    flex: 1,
  },
  amountValue: {
    ...theme.textStyles.bodyLargeSemiBold,
  },

  // Notes
  notes: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[3],
    fontStyle: 'italic' as const,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[8],
    paddingTop: theme.spacing[12],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[4],
  },
  emptySubtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },

  // Separator
  separator: {
    height: theme.spacing[3],
  },
});
