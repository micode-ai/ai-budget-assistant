import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useWalletStore } from '@/stores/walletStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { useGamificationStore } from '@/stores/gamificationStore';
import { formatCurrency } from '@budget/shared-utils';
import { useTranslation } from 'react-i18next';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { NewBadgeModal } from '@/components/gamification/NewBadgeModal';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { loadExpenses } = useExpenseStore();
  const { loadIncomes } = useIncomeStore();
  const { getTotalBudget } = useBudgetStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const { walletSummary, loadWallet } = useWalletStore();
  const { convertedIncomeTotal, convertedExpenseTotal, loadRates } = useExchangeRateStore();
  const { level, levelProgress, currentStreak, longestStreak, loadProfile } = useGamificationStore();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  useEffect(() => {
    if (currentAccountId) {
      loadIncomes();
      loadProfile();
    }
  }, [currentAccountId, loadIncomes, loadProfile]);

  const currency = user?.currencyCode || 'USD';
  const totalBudget = getTotalBudget();
  const budgetUsedPercent = totalBudget > 0 ? (convertedExpenseTotal / totalBudget) * 100 : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadExpenses(), loadIncomes(), loadWallet(), loadRates(), loadProfile()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadExpenses, loadIncomes, loadWallet, loadRates, loadProfile]);

  const remaining = totalBudget - convertedExpenseTotal;

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
          <Text style={styles.dateText}>{new Date().toLocaleDateString(getIntlLocale(), { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
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

        <TouchableOpacity style={styles.gamificationCard} activeOpacity={0.7} onPress={() => router.push('/achievements')}>
          <View style={styles.gamificationRow}>
            <View style={styles.gamificationItem}>
              <View style={[styles.levelBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.levelBadgeText}>{level}</Text>
              </View>
              <View>
                <Text style={styles.gamificationItemTitle}>{t('gamification.level', { level })}</Text>
                <View style={styles.xpBarContainer}>
                  <View style={styles.xpBar}>
                    <View style={[styles.xpBarFill, { width: `${levelProgress}%`, backgroundColor: theme.colors.primary }]} />
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.gamificationDivider} />
            <View style={styles.gamificationItem}>
              <Text style={styles.streakEmoji}>{currentStreak > 0 ? '🔥' : '❄️'}</Text>
              <View style={styles.gamificationTextContainer}>
                <Text style={styles.gamificationItemTitle} numberOfLines={1}>
                  {t('gamification.streak.days', { count: currentStreak })}
                </Text>
                <Text style={styles.gamificationItemSubtitle} numberOfLines={1}>
                  {currentStreak > 0 ? t('gamification.streak.keepGoing') : t('gamification.streak.broken')}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.gamificationLink}>{t('gamification.dashboardWidget.viewAll')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push('/(tabs)/budgets')}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('dashboard.monthlyBudget')}</Text>
          </View>
          <View style={styles.budgetOverview}>
            <View style={styles.budgetAmount}>
              <Text style={[styles.remainingAmount, remaining < 0 && { color: theme.colors.danger }]}>
                {formatCurrency(remaining, currency)}
              </Text>
              <Text style={styles.budgetTotal}>{t('common.of')} {formatCurrency(totalBudget, currency)}</Text>
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
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push({ pathname: '/(tabs)/expenses', params: { tab: 'income' } })}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('dashboard.totalIncome')}</Text>
          </View>
          <Text style={styles.incomeAmount}>+{formatCurrency(convertedIncomeTotal, currency)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push({ pathname: '/(tabs)/expenses', params: { tab: 'expenses' } })}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('dashboard.totalExpenses')}</Text>
          </View>
          <Text style={styles.expenseTotalAmount}>-{formatCurrency(convertedExpenseTotal, currency)}</Text>
        </TouchableOpacity>

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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.walletGrid}
              style={styles.walletGridScroll}
            >
              {walletSummary.map((summary) => (
                <TouchableOpacity key={summary.currencyCode} style={styles.walletCard} onPress={() => router.push('/wallet')}>
                  <Text style={styles.walletCurrency}>{summary.currencyCode}</Text>
                  <Text
                    style={[styles.walletBalance, summary.currentBalance < 0 && { color: theme.colors.danger }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {formatCurrency(summary.currentBalance, summary.currencyCode)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

      </ScrollView>
      <NewBadgeModal />
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
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: theme.spacing[2.5],
    marginBottom: theme.spacing[3],
  },
  cardTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  incomeAmount: {
    ...theme.textStyles.h3,
    color: theme.colors.success,
    fontWeight: '700' as const,
  },
  expenseTotalAmount: {
    ...theme.textStyles.h3,
    color: theme.colors.danger,
    fontWeight: '700' as const,
  },
  remainingAmount: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    fontWeight: '700' as const,
  },
  budgetOverview: {
    gap: theme.spacing[4],
  },
  budgetAmount: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[2],
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
  walletGridScroll: {
    marginHorizontal: -theme.spacing[4],
  },
  walletGrid: {
    flexDirection: 'row' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[1],
    gap: theme.spacing[2],
  },
  walletCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    width: 140,
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
  gamificationCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[5],
    borderWidth: 1,
    borderColor: '#F5A623' + '40',
    ...theme.shadows.sm,
  },
  gamificationRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  gamificationItem: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  gamificationTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  gamificationDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.borderLight,
    marginHorizontal: theme.spacing[3],
  },
  levelBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  gamificationItemTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  gamificationItemSubtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  xpBarContainer: {
    marginTop: 3,
  },
  xpBar: {
    height: 3,
    width: 60,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: 1.5,
    overflow: 'hidden' as const,
  },
  xpBarFill: {
    height: '100%' as const,
    borderRadius: 1.5,
  },
  streakEmoji: {
    fontSize: 24,
  },
  gamificationLink: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textLink,
    textAlign: 'center' as const,
    marginTop: theme.spacing[3],
  },
});
