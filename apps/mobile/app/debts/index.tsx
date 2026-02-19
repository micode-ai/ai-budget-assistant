import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDebtStore } from '@/stores/debtStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { DebtSummary, DebtStatus } from '@budget/shared-types';

type ActiveTab = 'lent' | 'borrowed';
type FilterType = 'all' | 'active' | 'overdue' | 'paid';

export default function DebtsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<ActiveTab>('lent');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);

  const {
    lentDebts,
    borrowedDebts,
    loadDebts,
    getActiveDebts,
    getOverdueDebts,
    isLoading,
  } = useDebtStore();

  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const userCurrency = useAuthStore((s) => s.user?.currencyCode || 'USD');
  const rates = useExchangeRateStore((s) => s.rates);

  useEffect(() => {
    loadDebts();
  }, [currentAccountId, loadDebts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDebts();
    } finally {
      setRefreshing(false);
    }
  }, [loadDebts]);

  const getFilteredDebts = useCallback((): DebtSummary[] => {
    const type = activeTab;

    switch (activeFilter) {
      case 'active':
        return getActiveDebts(type);
      case 'overdue':
        return getOverdueDebts(type);
      case 'paid':
        return (type === 'lent' ? lentDebts : borrowedDebts).filter(
          (d) => d.status === 'paid',
        );
      case 'all':
      default:
        return type === 'lent' ? lentDebts : borrowedDebts;
    }
  }, [activeTab, activeFilter, lentDebts, borrowedDebts, getActiveDebts, getOverdueDebts]);

  const filteredDebts = getFilteredDebts();
  const totalLent = lentDebts.reduce(
    (sum, d) => sum + convertAmount(d.remainingAmount, d.currencyCode, userCurrency, rates), 0,
  );
  const totalBorrowed = borrowedDebts.reduce(
    (sum, d) => sum + convertAmount(d.remainingAmount, d.currencyCode, userCurrency, rates), 0,
  );

  const getStatusColor = (status: DebtStatus): string => {
    switch (status) {
      case 'active':
        return theme.colors.primary;
      case 'overdue':
        return theme.colors.danger;
      case 'paid':
        return theme.colors.success;
      default:
        return theme.colors.textTertiary;
    }
  };

  const getStatusBackgroundColor = (status: DebtStatus): string => {
    switch (status) {
      case 'active':
        return theme.colors.primaryLight;
      case 'overdue':
        return theme.colors.dangerLight;
      case 'paid':
        return theme.colors.primaryLight;
      default:
        return theme.colors.surfaceSecondary;
    }
  };

  const formatDueDate = (dueDate: Date): string => {
    const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderSummaryCards = () => (
    <View style={styles.summaryRow}>
      <View style={[styles.summaryCard, styles.summaryCardLent]}>
        <Ionicons name="arrow-down-circle-outline" size={24} color={theme.colors.success} />
        <Text style={styles.summaryLabel}>{t('debt.peopleOweYou')}</Text>
        <Text style={[styles.summaryAmount, { color: theme.colors.success }]}>
          {formatCurrency(totalLent, userCurrency)}
        </Text>
      </View>
      <View style={[styles.summaryCard, styles.summaryCardBorrowed]}>
        <Ionicons name="arrow-up-circle-outline" size={24} color={theme.colors.danger} />
        <Text style={styles.summaryLabel}>{t('debt.youOwe')}</Text>
        <Text style={[styles.summaryAmount, { color: theme.colors.danger }]}>
          {formatCurrency(totalBorrowed, userCurrency)}
        </Text>
      </View>
    </View>
  );

  const renderSegmentedTabs = () => (
    <View style={styles.segmentedControl}>
      <TouchableOpacity
        style={[styles.segmentButton, activeTab === 'lent' && styles.segmentButtonActive]}
        onPress={() => {
          setActiveTab('lent');
          setActiveFilter('all');
        }}
      >
        <Text style={[styles.segmentText, activeTab === 'lent' && styles.segmentTextActive]}>
          {t('debt.moneyLent')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.segmentButton, activeTab === 'borrowed' && styles.segmentButtonActive]}
        onPress={() => {
          setActiveTab('borrowed');
          setActiveFilter('all');
        }}
      >
        <Text style={[styles.segmentText, activeTab === 'borrowed' && styles.segmentTextActive]}>
          {t('debt.moneyBorrowed')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: t('debt.filterAll') },
    { key: 'active', label: t('debt.filterActive') },
    { key: 'overdue', label: t('debt.filterOverdue') },
    { key: 'paid', label: t('debt.filterPaid') },
  ];

  const renderFilterChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
    >
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter.key}
          style={[styles.filterChip, activeFilter === filter.key && styles.filterChipActive]}
          onPress={() => setActiveFilter(filter.key)}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === filter.key && styles.filterChipTextActive,
            ]}
          >
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderDebtItem = ({ item }: { item: DebtSummary }) => {
    const progress = item.originalAmount > 0
      ? Math.min(item.totalRepaid / item.originalAmount, 1)
      : 0;
    const progressPercent = Math.round(progress * 100);

    const handlePress = () => {
      if (item.type === 'lent') {
        router.push(`/expense/${item.id}`);
      } else {
        router.push(`/income/${item.id}`);
      }
    };

    return (
      <TouchableOpacity style={styles.debtCard} onPress={handlePress}>
        <View style={styles.debtHeader}>
          <View style={styles.debtInfo}>
            <Text style={styles.contactName} numberOfLines={1}>
              {item.contactName}
            </Text>
            {item.description ? (
              <Text style={styles.debtDescription} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusBackgroundColor(item.status) },
            ]}
          >
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {t(`debt.status${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}`)}
            </Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <View style={styles.amountColumn}>
            <Text style={styles.amountLabel}>{t('debt.originalAmount')}</Text>
            <Text style={styles.originalAmount}>
              {formatCurrency(item.originalAmount, item.currencyCode)}
            </Text>
          </View>
          <View style={styles.amountColumn}>
            <Text style={styles.amountLabel}>{t('debt.remaining')}</Text>
            <Text
              style={[
                styles.remainingAmount,
                {
                  color:
                    item.status === 'paid'
                      ? theme.colors.success
                      : item.status === 'overdue'
                        ? theme.colors.danger
                        : theme.colors.textPrimary,
                },
              ]}
            >
              {formatCurrency(item.remainingAmount, item.currencyCode)}
            </Text>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor:
                    item.status === 'paid'
                      ? theme.colors.success
                      : item.status === 'overdue'
                        ? theme.colors.danger
                        : theme.colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progressPercent}%</Text>
        </View>

        {item.dueDate ? (
          <View style={styles.dueDateRow}>
            <Ionicons name="calendar-outline" size={14} color={theme.colors.textTertiary} />
            <Text
              style={[
                styles.dueDateText,
                item.status === 'overdue' && { color: theme.colors.danger },
              ]}
            >
              {formatDueDate(item.dueDate)}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const ListHeaderComponent = () => (
    <View>
      {renderSummaryCards()}
      {renderSegmentedTabs()}
      {renderFilterChips()}
    </View>
  );

  const ListEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={64} color={theme.colors.textDisabled} />
      <Text style={styles.emptyTitle}>{t('debt.noDebts')}</Text>
      <Text style={styles.emptySubtitle}>{t('debt.noDebtsHint')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen
        options={{
          title: t('debt.debtsAndLoans'),
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.textPrimary,
        }}
      />
      <FlatList
        data={filteredDebts}
        renderItem={renderDebtItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />
        }
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <View style={[styles.bottomTabBar, { paddingBottom: 8 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)')}>
          <Ionicons name="home-outline" size={22} color={theme.colors.tabBarInactive} />
          <Text style={styles.tabLabel}>{t('nav.dashboard')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/expenses')}>
          <Ionicons name="receipt-outline" size={22} color={theme.colors.tabBarInactive} />
          <Text style={styles.tabLabel}>{t('nav.expenses')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/budgets')}>
          <Ionicons name="wallet-outline" size={22} color={theme.colors.tabBarInactive} />
          <Text style={styles.tabLabel}>{t('nav.budgets')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/analytics')}>
          <Ionicons name="bar-chart-outline" size={22} color={theme.colors.tabBarInactive} />
          <Text style={styles.tabLabel}>{t('nav.analytics')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/chat')}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.colors.tabBarInactive} />
          <Text style={styles.tabLabel}>{t('nav.aiChat')}</Text>
        </TouchableOpacity>
      </View>
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

  // Summary cards
  summaryRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  summaryCard: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    alignItems: 'flex-start' as const,
    ...theme.shadows.sm,
  },
  summaryCardLent: {
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success,
  },
  summaryCardBorrowed: {
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.danger,
  },
  summaryLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
  summaryAmount: {
    ...theme.textStyles.h3,
    marginTop: theme.spacing[1],
  },

  // Segmented tabs
  segmentedControl: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
    marginBottom: theme.spacing[3],
  },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  segmentText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  segmentTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },

  // Filter chips
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: theme.spacing[4],
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

  // Debt card
  debtCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  debtHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: theme.spacing[3],
  },
  debtInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  contactName: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  debtDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  statusBadge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  statusText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
  amountRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
  },
  amountColumn: {
    flex: 1,
  },
  amountLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[0.5],
  },
  originalAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  remainingAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
  },

  // Progress bar
  progressContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: theme.borderRadius.sm,
  },
  progressText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    width: 40,
    textAlign: 'right' as const,
  },

  // Due date
  dueDateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[3],
  },
  dueDateText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
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

  // Bottom tab bar
  bottomTabBar: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 2,
  },
  tabLabel: {
    ...theme.textStyles.tabLabel,
    color: theme.colors.tabBarInactive,
  },
});
