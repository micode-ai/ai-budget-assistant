import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useExpenseStore } from '@/stores/expenseStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { formatCurrency, formatRelativeDate } from '@budget/shared-utils';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { expenses, totalThisMonth, loadExpenses } = useExpenseStore();
  const { activeBudgets, getTotalBudget } = useBudgetStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const theme = useTheme();
  const styles = useStyles(createStyles);

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

  const progressColor = budgetUsedPercent > 90
    ? theme.colors.danger
    : budgetUsedPercent > 70
      ? theme.colors.warning
      : theme.colors.primary;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>{t('dashboard.hello', { name: user?.name || 'User' })}</Text>
          <Text style={styles.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </View>

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
                    { width: `${Math.min(budgetUsedPercent, 100)}%`, backgroundColor: progressColor },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>{t('dashboard.used', { percent: budgetUsedPercent.toFixed(0) })}</Text>
            </View>
          </View>
        </View>

        {canEdit && (
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/expense/new')}>
              <Ionicons name="add-circle" size={32} color={theme.colors.primary} />
              <Text style={styles.quickActionText}>{t('dashboard.addExpense')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/expense/voice')}>
              <Ionicons name="mic" size={32} color={theme.colors.accent} />
              <Text style={styles.quickActionText}>{t('dashboard.voiceInput')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/expense/receipt')}>
              <Ionicons name="camera" size={32} color={theme.colors.secondary} />
              <Text style={styles.quickActionText}>{t('dashboard.scanReceipt')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.recentExpenses')}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/expenses')}>
              <Text style={styles.seeAllText}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>
          {recentExpenses.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={theme.colors.textTertiary} />
              <Text style={styles.emptyStateText}>{t('dashboard.noExpenses')}</Text>
              <Text style={styles.emptyStateSubtext}>{t('dashboard.addFirstExpense')}</Text>
            </View>
          ) : (
            recentExpenses.map((expense) => (
              <TouchableOpacity key={expense.id} style={styles.expenseItem} onPress={() => router.push(`/expense/${expense.id}`)}>
                <View style={styles.expenseInfo}>
                  <Text style={styles.expenseDescription}>{expense.description || t('dashboard.expense')}</Text>
                  <Text style={styles.expenseDate}>{formatRelativeDate(expense.date)}</Text>
                </View>
                <Text style={styles.expenseAmount}>-{formatCurrency(expense.amount, expense.currencyCode)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.activeBudgets')}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/budgets')}>
              <Text style={styles.seeAllText}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>
          {activeBudgets.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={48} color={theme.colors.textTertiary} />
              <Text style={styles.emptyStateText}>{t('dashboard.noBudgets')}</Text>
              <Text style={styles.emptyStateSubtext}>{t('dashboard.createBudgetHint')}</Text>
            </View>
          ) : (
            activeBudgets.slice(0, 3).map((budget) => (
              <TouchableOpacity key={budget.id} style={styles.budgetItem} onPress={() => router.push(`/budget/${budget.id}`)}>
                <View style={styles.budgetInfo}>
                  <Text style={styles.budgetName}>{budget.name}</Text>
                  <Text style={styles.budgetPeriod}>{budget.period}</Text>
                </View>
                <Text style={styles.budgetAmountText}>{formatCurrency(budget.amount, budget.currencyCode)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
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
  welcomeSection: {
    marginBottom: theme.spacing[6],
  },
  welcomeText: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
  },
  dateText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[5],
    ...theme.shadows.md,
  },
  cardTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  budgetOverview: {
    gap: theme.spacing[4],
  },
  budgetAmount: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[2],
  },
  spentAmount: {
    ...theme.textStyles.h2,
    fontSize: 32,
    color: theme.colors.textPrimary,
  },
  budgetTotal: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
  },
  progressContainer: {
    gap: theme.spacing[2],
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: theme.borderRadius.sm,
  },
  progressText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  quickActions: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    marginBottom: theme.spacing[6],
  },
  quickActionButton: {
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    padding: theme.spacing[3],
  },
  quickActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  seeAllText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textLink,
  },
  emptyState: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[8],
    alignItems: 'center' as const,
  },
  emptyStateText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[3],
  },
  emptyStateSubtext: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  expenseItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  expenseDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  expenseAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.danger,
  },
  budgetItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  budgetInfo: {
    flex: 1,
  },
  budgetName: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  budgetPeriod: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    textTransform: 'capitalize' as const,
  },
  budgetAmountText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.primary,
  },
});
