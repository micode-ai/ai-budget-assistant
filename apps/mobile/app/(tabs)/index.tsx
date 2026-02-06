import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useExpenseStore } from '@/stores/expenseStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatRelativeDate } from '@budget/shared-utils';
import { useTranslation } from 'react-i18next';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { expenses, totalThisMonth, loadExpenses } = useExpenseStore();
  const { activeBudgets, getTotalBudget } = useBudgetStore();

  const currency = user?.currencyCode || 'USD';
  const totalBudget = getTotalBudget();
  const budgetUsedPercent = totalBudget > 0 ? (totalThisMonth / totalBudget) * 100 : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadExpenses();
    } finally {
      setRefreshing(false);
    }
  }, [loadExpenses]);

  const recentExpenses = expenses.slice(0, 5);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Welcome Header */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>{t('dashboard.hello', { name: user?.name || 'User' })}</Text>
          <Text style={styles.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </View>

        {/* Budget Overview Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('dashboard.monthlyBudget')}</Text>
          <View style={styles.budgetOverview}>
            <View style={styles.budgetAmount}>
              <Text style={styles.spentAmount}>{formatCurrency(totalThisMonth, currency)}</Text>
              <Text style={styles.budgetTotal}>of {formatCurrency(totalBudget, currency)}</Text>
            </View>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(budgetUsedPercent, 100)}%`,
                      backgroundColor: budgetUsedPercent > 90 ? '#FF6B6B' : budgetUsedPercent > 70 ? '#FFEAA7' : '#4ECDC4',
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>{t('dashboard.used', { percent: budgetUsedPercent.toFixed(0) })}</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push('/expense/new')}
          >
            <Ionicons name="add-circle" size={32} color="#4ECDC4" />
            <Text style={styles.quickActionText}>{t('dashboard.addExpense')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push('/expense/voice')}
          >
            <Ionicons name="mic" size={32} color="#96CEB4" />
            <Text style={styles.quickActionText}>{t('dashboard.voiceInput')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push('/expense/receipt')}
          >
            <Ionicons name="camera" size={32} color="#45B7D1" />
            <Text style={styles.quickActionText}>{t('dashboard.scanReceipt')}</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Expenses */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.recentExpenses')}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/expenses')}>
              <Text style={styles.seeAllText}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          {recentExpenses.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>{t('dashboard.noExpenses')}</Text>
              <Text style={styles.emptyStateSubtext}>{t('dashboard.addFirstExpense')}</Text>
            </View>
          ) : (
            recentExpenses.map((expense) => (
              <TouchableOpacity
                key={expense.id}
                style={styles.expenseItem}
                onPress={() => router.push(`/expense/${expense.id}`)}
              >
                <View style={styles.expenseInfo}>
                  <Text style={styles.expenseDescription}>{expense.description || t('dashboard.expense')}</Text>
                  <Text style={styles.expenseDate}>{formatRelativeDate(expense.date)}</Text>
                </View>
                <Text style={styles.expenseAmount}>
                  -{formatCurrency(expense.amount, expense.currencyCode)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Active Budgets */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.activeBudgets')}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/budgets')}>
              <Text style={styles.seeAllText}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          {activeBudgets.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>{t('dashboard.noBudgets')}</Text>
              <Text style={styles.emptyStateSubtext}>{t('dashboard.createBudgetHint')}</Text>
            </View>
          ) : (
            activeBudgets.slice(0, 3).map((budget) => (
              <TouchableOpacity
                key={budget.id}
                style={styles.budgetItem}
                onPress={() => router.push(`/budget/${budget.id}`)}
              >
                <View style={styles.budgetInfo}>
                  <Text style={styles.budgetName}>{budget.name}</Text>
                  <Text style={styles.budgetPeriod}>{budget.period}</Text>
                </View>
                <Text style={styles.budgetAmountText}>
                  {formatCurrency(budget.amount, budget.currencyCode)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  welcomeSection: {
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  dateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  budgetOverview: {
    gap: 16,
  },
  budgetAmount: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  spentAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  budgetTotal: {
    fontSize: 16,
    color: '#999',
  },
  progressContainer: {
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  quickActionButton: {
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  quickActionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  seeAllText: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '500',
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  expenseItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  expenseDate: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  budgetItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetInfo: {
    flex: 1,
  },
  budgetName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  budgetPeriod: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  budgetAmountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ECDC4',
  },
});
