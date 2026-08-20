import { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDebtStore } from '@/stores/debtStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { DebtSummary } from '@budget/shared-types';
import { DebtSummaryCards } from '@/components/debts/DebtSummaryCards';
import { DebtSegmentedTabs, type DebtActiveTab } from '@/components/debts/DebtSegmentedTabs';
import { DebtFilterChips, type DebtFilterType } from '@/components/debts/DebtFilterChips';
import { DebtListItem } from '@/components/debts/DebtListItem';
import { AddDebtSheet } from '@/components/debts/AddDebtSheet';
import { DebtsEmptyState } from '@/components/debts/DebtsEmptyState';
import { DebtsBottomNav } from '@/components/debts/DebtsBottomNav';

export default function DebtsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<DebtActiveTab>('lent');
  const [activeFilter, setActiveFilter] = useState<DebtFilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      loadDebts();
    }, [loadDebts]),
  );

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

  const handleChangeTab = (tab: DebtActiveTab) => {
    setActiveTab(tab);
    setActiveFilter('all');
  };

  const ListHeaderComponent = () => (
    <View>
      <DebtSummaryCards
        totalLent={totalLent}
        totalBorrowed={totalBorrowed}
        currencyCode={userCurrency}
      />
      <DebtSegmentedTabs activeTab={activeTab} onChange={handleChangeTab} />
      <DebtFilterChips activeFilter={activeFilter} onChange={setActiveFilter} />
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
        renderItem={({ item }) => <DebtListItem item={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />
        }
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={DebtsEmptyState}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <TouchableOpacity
        style={[styles.fab, { bottom: 90 + insets.bottom }]}
        activeOpacity={0.85}
        onPress={() => setShowAddSheet(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <AddDebtSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} />

      <DebtsBottomNav bottomInset={insets.bottom} />
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
  separator: {
    height: theme.spacing[3],
  },
  fab: {
    position: 'absolute' as const,
    right: theme.spacing[4],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...theme.shadows.md,
    zIndex: 10,
  },
});
