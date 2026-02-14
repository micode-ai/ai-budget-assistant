import { View, Text, FlatList, TouchableOpacity, RefreshControl, Animated } from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useAccountStore } from '@/stores/accountStore';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { Expense, Income } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

type ActiveTab = 'expenses' | 'income';

export default function ExpensesScreen() {
  const { t } = useTranslation();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('expenses');

  useEffect(() => {
    if (tab === 'income' || tab === 'expenses') {
      setActiveTab(tab);
    }
  }, [tab]);
  const { loadExpenses, getFilteredExpenses } = useExpenseStore();
  const { loadIncomes, getFilteredIncomes } = useIncomeStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const expenses = getFilteredExpenses();
  const incomes = getFilteredIncomes();
  const fabAnimation = useRef(new Animated.Value(0)).current;
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'expenses') {
        await loadExpenses();
      } else {
        await loadIncomes();
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadExpenses, loadIncomes, activeTab]);

  const toggleFab = () => {
    const toValue = fabOpen ? 0 : 1;
    Animated.spring(fabAnimation, {
      toValue,
      friction: 6,
      useNativeDriver: true,
    }).start();
    setFabOpen(!fabOpen);
  };

  const handleAddExpense = () => {
    setFabOpen(false);
    fabAnimation.setValue(0);
    router.push('/expense/new');
  };

  const handleVoiceInput = () => {
    setFabOpen(false);
    fabAnimation.setValue(0);
    router.push('/expense/voice');
  };

  const handleScanReceipt = () => {
    setFabOpen(false);
    fabAnimation.setValue(0);
    router.push('/expense/receipt');
  };

  const renderExpenseItem = ({ item }: { item: Expense }) => (
    <TouchableOpacity
      style={styles.expenseCard}
      onPress={() => router.push(`/expense/${item.id}`)}
    >
      <View style={styles.expenseIcon}>
        <Ionicons name="receipt-outline" size={24} color={theme.colors.primary} />
      </View>
      <View style={styles.expenseDetails}>
        <Text style={styles.expenseDescription} numberOfLines={1}>
          {item.description || 'Expense'}
        </Text>
        <Text style={styles.expenseDate}>{formatDate(item.date, undefined, getIntlLocale())}</Text>
      </View>
      <Text style={styles.expenseAmount}>
        -{formatCurrency(item.amount, item.currencyCode)}
      </Text>
    </TouchableOpacity>
  );

  const renderIncomeItem = ({ item }: { item: Income }) => (
    <TouchableOpacity
      style={styles.expenseCard}
      onPress={() => router.push(`/income/${item.id}`)}
    >
      <View style={[styles.expenseIcon, { backgroundColor: theme.colors.success + '18' }]}>
        <Ionicons name="trending-up-outline" size={24} color={theme.colors.success} />
      </View>
      <View style={styles.expenseDetails}>
        <Text style={styles.expenseDescription} numberOfLines={1}>
          {item.description || 'Income'}
        </Text>
        <Text style={styles.expenseDate}>{formatDate(item.date, undefined, getIntlLocale())}</Text>
      </View>
      <Text style={[styles.expenseAmount, { color: theme.colors.success }]}>
        +{formatCurrency(item.amount, item.currencyCode)}
      </Text>
    </TouchableOpacity>
  );

  const ExpenseEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={64} color={theme.colors.textDisabled} />
      <Text style={styles.emptyTitle}>{t('expenses.noExpenses')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('expenses.addFirst')}
      </Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/expense/new')}
      >
        <Text style={styles.addButtonText}>{t('expenses.addExpense')}</Text>
      </TouchableOpacity>
    </View>
  );

  const IncomeEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="trending-up-outline" size={64} color={theme.colors.textDisabled} />
      <Text style={styles.emptyTitle}>{t('incomes.noIncomes')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('incomes.addFirst')}
      </Text>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.colors.success }]}
        onPress={() => router.push('/income/new')}
      >
        <Text style={styles.addButtonText}>{t('incomes.addIncome')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Segmented Control */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segmentButton, activeTab === 'expenses' && styles.segmentButtonActive]}
          onPress={() => setActiveTab('expenses')}
        >
          <Text style={[styles.segmentText, activeTab === 'expenses' && styles.segmentTextActive]}>
            {t('expenses.tabExpenses')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentButton, activeTab === 'income' && styles.segmentButtonActive]}
          onPress={() => setActiveTab('income')}
        >
          <Text style={[styles.segmentText, activeTab === 'income' && styles.segmentTextActive]}>
            {t('expenses.tabIncome')}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'expenses' ? (
        <FlatList
          data={expenses}
          renderItem={renderExpenseItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={ExpenseEmptyComponent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <FlatList
          data={incomes}
          renderItem={renderIncomeItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={IncomeEmptyComponent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Floating Action Button (hidden for viewers) */}
      {activeTab === 'income' && canEdit && (
        <View style={styles.fabContainer}>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: theme.colors.success }]}
            onPress={() => router.push('/income/new')}
            activeOpacity={0.9}
          >
            <Ionicons name="add" size={28} color={theme.colors.textInverse} />
          </TouchableOpacity>
        </View>
      )}

      {fabOpen && canEdit && activeTab === 'expenses' && (
        <TouchableOpacity
          style={styles.fabOverlay}
          activeOpacity={1}
          onPress={toggleFab}
        />
      )}

      {canEdit && activeTab === 'expenses' && <View style={styles.fabContainer}>
        {/* Receipt Button */}
        <Animated.View
          style={[
            styles.fabOption,
            {
              transform: [
                {
                  translateY: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -180],
                  }),
                },
                {
                  scale: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ],
              opacity: fabAnimation,
            },
          ]}
        >
          <TouchableOpacity style={styles.fabOptionButton} onPress={handleScanReceipt}>
            <Ionicons name="camera" size={22} color={theme.colors.textInverse} />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.fabOptionLabel,
              {
                opacity: fabAnimation,
              },
            ]}
          >
            {t('expenses.scanReceipt')}
          </Animated.Text>
        </Animated.View>

        {/* Voice Button */}
        <Animated.View
          style={[
            styles.fabOption,
            {
              transform: [
                {
                  translateY: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -120],
                  }),
                },
                {
                  scale: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ],
              opacity: fabAnimation,
            },
          ]}
        >
          <TouchableOpacity style={[styles.fabOptionButton, { backgroundColor: theme.colors.accent }]} onPress={handleVoiceInput}>
            <Ionicons name="mic" size={22} color={theme.colors.textInverse} />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.fabOptionLabel,
              {
                opacity: fabAnimation,
              },
            ]}
          >
            {t('expenses.voiceInput')}
          </Animated.Text>
        </Animated.View>

        {/* Manual Button */}
        <Animated.View
          style={[
            styles.fabOption,
            {
              transform: [
                {
                  translateY: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -60],
                  }),
                },
                {
                  scale: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ],
              opacity: fabAnimation,
            },
          ]}
        >
          <TouchableOpacity style={[styles.fabOptionButton, { backgroundColor: theme.colors.primary }]} onPress={handleAddExpense}>
            <Ionicons name="create" size={22} color={theme.colors.textInverse} />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.fabOptionLabel,
              {
                opacity: fabAnimation,
              },
            ]}
          >
            {t('expenses.manualEntry')}
          </Animated.Text>
        </Animated.View>

        {/* Main FAB */}
        <TouchableOpacity style={styles.fab} onPress={toggleFab} activeOpacity={0.9}>
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '45deg'],
                  }),
                },
              ],
            }}
          >
            <Ionicons name="add" size={28} color={theme.colors.textInverse} />
          </Animated.View>
        </TouchableOpacity>
      </View>}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  segmentedControl: {
    flexDirection: 'row' as const,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
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
  listContent: {
    padding: theme.spacing[4],
    paddingBottom: 100,
    flexGrow: 1 as const,
  },
  expenseCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    ...theme.shadows.sm,
  },
  expenseIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: theme.spacing[3],
  },
  expenseDetails: {
    flex: 1,
  },
  expenseDescription: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  expenseDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  expenseAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.danger,
  },
  separator: {
    height: theme.spacing[2],
  },
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
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[6],
  },
  addButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius['3xl'],
  },
  addButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  fabOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.scrim,
  },
  fabContainer: {
    position: 'absolute' as const,
    right: theme.spacing[5],
    bottom: theme.spacing[5],
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
  fabOption: {
    position: 'absolute' as const,
    right: 4,
    bottom: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  fabOptionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    ...theme.shadows.lg,
  },
  fabOptionLabel: {
    position: 'absolute' as const,
    right: 58,
    backgroundColor: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.textInverse,
    ...theme.textStyles.bodySmMedium,
    overflow: 'hidden' as const,
  },
});
