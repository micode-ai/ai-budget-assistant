import { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useWalletStore } from '@/stores/walletStore';
import { useAccountStore } from '@/stores/accountStore';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { AccountTransfer } from '@budget/shared-types';

type PeriodFilter = 'all' | 'this_month' | 'last_3_months' | 'this_year';

export default function TransferHistoryScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { transfers, loadWallet, isLoading } = useWalletStore();
  const accounts = useAccountStore((s) => s.accounts);

  useFocusEffect(
    useCallback(() => {
      loadWallet();
    }, [loadWallet]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadWallet();
    } finally {
      setRefreshing(false);
    }
  }, [loadWallet]);

  const filteredTransfers = useMemo(() => {
    let result = [...transfers].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Filter by account
    if (selectedAccountId) {
      result = result.filter(
        (tr) => tr.fromAccountId === selectedAccountId || tr.toAccountId === selectedAccountId,
      );
    }

    // Filter by period
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
        default:
          cutoff = new Date(0);
      }

      result = result.filter((tr) => new Date(tr.date).getTime() >= cutoff.getTime());
    }

    return result;
  }, [transfers, selectedAccountId, periodFilter]);

  const accountFilters = useMemo(
    () => [
      { id: null, label: t('transfer.allAccounts') },
      ...accounts.map((a) => ({ id: a.id, label: a.name })),
    ],
    [accounts, t],
  );

  const periodFilters: { key: PeriodFilter; label: string }[] = [
    { key: 'all', label: t('transfer.periodAll') },
    { key: 'this_month', label: t('transfer.periodThisMonth') },
    { key: 'last_3_months', label: t('transfer.periodLast3Months') },
    { key: 'this_year', label: t('transfer.periodThisYear') },
  ];

  const renderAccountChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
    >
      {accountFilters.map((af) => (
        <TouchableOpacity
          key={af.id ?? 'all'}
          style={[styles.filterChip, selectedAccountId === af.id && styles.filterChipActive]}
          onPress={() => setSelectedAccountId(af.id)}
        >
          <Text
            style={[
              styles.filterChipText,
              selectedAccountId === af.id && styles.filterChipTextActive,
            ]}
          >
            {af.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderPeriodChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
    >
      {periodFilters.map((pf) => (
        <TouchableOpacity
          key={pf.key}
          style={[styles.filterChip, periodFilter === pf.key && styles.filterChipActive]}
          onPress={() => setPeriodFilter(pf.key)}
        >
          <Text
            style={[
              styles.filterChipText,
              periodFilter === pf.key && styles.filterChipTextActive,
            ]}
          >
            {pf.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderTransferItem = ({ item }: { item: AccountTransfer }) => {
    const fromAccount = accounts.find((a) => a.id === item.fromAccountId);
    const toAccount = accounts.find((a) => a.id === item.toAccountId);

    return (
      <TouchableOpacity
        style={styles.transferCard}
        onPress={() => router.push({ pathname: '/wallet/[id]', params: { id: item.id } })}
      >
        <View style={styles.transferHeader}>
          <View style={styles.transferInfo}>
            <Text style={styles.transferDirection} numberOfLines={1}>
              {fromAccount?.name || '...'} → {toAccount?.name || '...'}
            </Text>
            <Text style={styles.transferDate}>
              {new Date(item.date).toLocaleDateString(getIntlLocale())}
            </Text>
            {item.notes ? (
              <Text style={styles.transferNotes} numberOfLines={1}>
                {item.notes}
              </Text>
            ) : null}
          </View>
          <View style={styles.transferAmounts}>
            <Text style={styles.transferFromAmount}>
              -{formatCurrency(item.fromAmount, item.fromCurrency)}
            </Text>
            <Text style={styles.transferToAmount}>
              +{formatCurrency(item.toAmount, item.toCurrency)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeaderComponent = () => (
    <View>
      {renderAccountChips()}
      {renderPeriodChips()}
    </View>
  );

  const ListEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="swap-horizontal-outline" size={64} color={theme.colors.textDisabled} />
      <Text style={styles.emptyTitle}>{t('transfer.noTransfers')}</Text>
      <Text style={styles.emptySubtitle}>{t('transfer.noTransfersHint')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/wallet/transfer')}
              accessibilityLabel={t('transfer.title')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ paddingHorizontal: 12 }}
            >
              <Ionicons name="add" size={28} color={theme.colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <FlatList
        data={filteredTransfers}
        renderItem={renderTransferItem}
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

  // Transfer card
  transferCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  transferHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
  },
  transferInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  transferDirection: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  transferDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  transferNotes: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  transferAmounts: {
    alignItems: 'flex-end' as const,
  },
  transferFromAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.danger,
  },
  transferToAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.success,
    marginTop: theme.spacing[0.5],
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
