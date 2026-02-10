import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useWalletStore } from '@/stores/walletStore';
import { formatCurrency, formatRelativeDate } from '@budget/shared-utils';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { expenses, totalThisMonth, loadExpenses } = useExpenseStore();
  const { incomeTotalsByCurrency, loadIncomes } = useIncomeStore();
  const { activeBudgets, getTotalBudget } = useBudgetStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const { walletSummary, loadWallet } = useWalletStore();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const currency = user?.currencyCode || 'USD';
  const totalBudget = getTotalBudget();
  const budgetUsedPercent = totalBudget > 0 ? (totalThisMonth / totalBudget) * 100 : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadExpenses(), loadIncomes(), loadWallet()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadExpenses, loadWallet]);

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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('dashboard.totalIncome')}</Text>
          {Object.keys(incomeTotalsByCurrency).length === 0 ? (
            <Text style={styles.incomeAmount}>+{formatCurrency(0, currency)}</Text>
          ) : (
            Object.entries(incomeTotalsByCurrency).map(([code, amount]) => (
              <Text key={code} style={styles.incomeAmount}>+{formatCurrency(amount, code as any)}</Text>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.walletBalances')}</Text>
            {walletSummary.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/wallet')}>
                <Text style={styles.seeAllText}>{t('dashboard.seeAll')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {walletSummary.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={48} color={theme.colors.textTertiary} />
              <Text style={styles.emptyStateText}>{t('wallet.noBalances')}</Text>
              <Text style={styles.emptyStateSubtext}>{t('wallet.noBalancesHint')}</Text>
              {canEdit && (
                <TouchableOpacity style={styles.emptyStateButton} onPress={() => router.push('/wallet/set-balance')}>
                  <Text style={styles.emptyStateButtonText}>{t('wallet.addBalance')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.walletGrid}>
              {walletSummary.map((summary) => (
                <TouchableOpacity key={summary.currencyCode} style={styles.walletCard} onPress={() => router.push('/wallet')}>
                  <Text style={styles.walletCurrency}>{summary.currencyCode}</Text>
                  <Text style={[styles.walletBalance, summary.currentBalance < 0 && { color: theme.colors.danger }]}>
                    {formatCurrency(summary.currentBalance, summary.currencyCode)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {canEdit && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActions}
            style={styles.quickActionsScroll}
          >
            <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/expense/new')}>
              <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.primary + '18' }]}>
                <Ionicons name="add-circle" size={28} color={theme.colors.primary} />
              </View>
              <Text style={styles.quickActionText} numberOfLines={2}>{t('dashboard.addExpense')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/expense/voice')}>
              <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.accent + '18' }]}>
                <Ionicons name="mic" size={28} color={theme.colors.accent} />
              </View>
              <Text style={styles.quickActionText} numberOfLines={2}>{t('dashboard.voiceInput')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/expense/receipt')}>
              <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.secondary + '18' }]}>
                <Ionicons name="camera" size={28} color={theme.colors.secondary} />
              </View>
              <Text style={styles.quickActionText} numberOfLines={2}>{t('dashboard.scanReceipt')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/wallet/exchange')}>
              <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.warning + '18' }]}>
                <Ionicons name="swap-horizontal" size={28} color={theme.colors.warning} />
              </View>
              <Text style={styles.quickActionText} numberOfLines={2}>{t('dashboard.exchangeCurrency')}</Text>
            </TouchableOpacity>
          </ScrollView>
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
  incomeAmount: {
    ...theme.textStyles.h2,
    fontSize: 28,
    color: theme.colors.success,
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
  quickActionsScroll: {
    marginBottom: theme.spacing[6],
    marginHorizontal: -theme.spacing[4],
  },
  quickActions: {
    flexDirection: 'row' as const,
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[3],
  },
  quickActionButton: {
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    width: 72,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  quickActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
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
  emptyStateButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[5],
    marginTop: theme.spacing[4],
  },
  emptyStateButtonText: {
    ...theme.textStyles.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600' as const,
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
  walletGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  walletCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    minWidth: 100,
    flex: 1,
    ...theme.shadows.sm,
  },
  walletCurrency: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  walletBalance: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
});
