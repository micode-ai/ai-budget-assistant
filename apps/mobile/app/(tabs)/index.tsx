import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const quickActionIcons = {
  add_expense: require('../../assets/widget-icons/add_expense.png'),
  scan_receipt: require('../../assets/widget-icons/scan_receipt.png'),
  voice_input: require('../../assets/widget-icons/voice_input.png'),
  exchange: require('../../assets/widget-icons/exchange.png'),
  converter: require('../../assets/widget-icons/converter.png'),
};
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useWalletStore } from '@/stores/walletStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { useGamificationStore } from '@/stores/gamificationStore';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useDebtStore } from '@/stores/debtStore';
import { formatCurrency } from '@budget/shared-utils';
import { useTranslation } from 'react-i18next';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { NewBadgeModal } from '@/components/gamification/NewBadgeModal';
import { FatFinderCard } from '@/components/insights/FatFinderCard';
import { GoalsCard } from '@/components/goals/GoalsCard';
import { AccountSwitcher } from '@/components/AccountSwitcher';
import { NetProfitWidget, NetCapitalWidget } from '@/components/widgets';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [widgetRefreshKey, setWidgetRefreshKey] = useState(0);
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { loadExpenses } = useExpenseStore();
  const { loadIncomes } = useIncomeStore();
  const { getTotalBudget } = useBudgetStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const { walletSummary, loadWallet } = useWalletStore();
  const { convertedIncomeTotal, convertedExpenseTotal, loadRates, rates } = useExchangeRateStore();
  const { level, levelProgress, currentStreak, loadProfile } = useGamificationStore();
  const { summary: investmentSummary, loadSummary: loadInvestmentSummary } = useInvestmentStore();
  const { lentDebts, borrowedDebts, loadDebts } = useDebtStore();
  const currentAccountType = useAccountStore((s) => s.accounts.find((a) => a.id === s.currentAccountId)?.type);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  const currency = user?.currencyCode || 'USD';

  const convertedLentTotal = lentDebts.reduce(
    (sum, d) => sum + convertAmount(d.remainingAmount, d.currencyCode, currency, rates), 0,
  );
  const convertedBorrowedTotal = borrowedDebts.reduce(
    (sum, d) => sum + convertAmount(d.remainingAmount, d.currencyCode, currency, rates), 0,
  );

  useEffect(() => {
    if (currentAccountId) {
      Promise.all([loadExpenses(), loadIncomes()]).then(() => loadDebts());
      loadProfile();
      if (currentAccountType === 'investment') {
        loadInvestmentSummary();
      }
    }
  }, [currentAccountId, loadExpenses, loadIncomes, loadProfile, loadDebts, currentAccountType, loadInvestmentSummary]);

  const totalBudget = getTotalBudget();
  const budgetUsedPercent = totalBudget > 0 ? (convertedExpenseTotal / totalBudget) * 100 : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const promises: Promise<any>[] = [loadWallet(), loadRates(), loadProfile()];
      if (currentAccountType === 'investment') {
        promises.push(loadInvestmentSummary());
      }
      await Promise.all([loadExpenses(), loadIncomes(), ...promises]);
      await loadDebts();
    } finally {
      setRefreshing(false);
      setWidgetRefreshKey((k) => k + 1);
    }
  }, [loadExpenses, loadIncomes, loadWallet, loadRates, loadProfile, loadDebts, currentAccountType, loadInvestmentSummary]);

  const remaining = totalBudget - convertedExpenseTotal;

  const progressColor = budgetUsedPercent > 90
    ? theme.colors.danger
    : budgetUsedPercent > 70
      ? theme.colors.warning
      : theme.colors.primary;

  const ICON_BOX = 48;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Orange Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.heroTopRow}>
          <AccountSwitcher compact />
          <Text style={styles.welcomeText} numberOfLines={1}>
            {t('dashboard.hello', { name: user?.name || 'User' })}
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            style={styles.settingsButton}
          >
            <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Actions — fixed between header and scroll content */}
      {canEdit && (
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/expense/new')}>
            <View style={[styles.quickActionIcon, { width: ICON_BOX, height: ICON_BOX }]}>
              <Image source={quickActionIcons.add_expense} style={styles.quickActionImage} />
            </View>
            <Text style={styles.quickActionText} numberOfLines={2}>{t('dashboard.addExpense')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/expense/receipt')}>
            <View style={[styles.quickActionIcon, { width: ICON_BOX, height: ICON_BOX }]}>
              <Image source={quickActionIcons.scan_receipt} style={styles.quickActionImage} />
            </View>
            <Text style={styles.quickActionText} numberOfLines={2}>{t('dashboard.scanReceipt')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/expense/voice')}>
            <View style={[styles.quickActionIcon, { width: ICON_BOX, height: ICON_BOX }]}>
              <Image source={quickActionIcons.voice_input} style={styles.quickActionImage} />
            </View>
            <Text style={styles.quickActionText} numberOfLines={2}>{t('dashboard.voiceInput')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/wallet/exchange')}>
            <View style={[styles.quickActionIcon, { width: ICON_BOX, height: ICON_BOX }]}>
              <Image source={quickActionIcons.exchange} style={styles.quickActionImage} />
            </View>
            <Text style={styles.quickActionText} numberOfLines={2}>{t('dashboard.exchangeCurrency')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => router.push('/converter')}>
            <View style={[styles.quickActionIcon, { width: ICON_BOX, height: ICON_BOX }]}>
              <Image source={quickActionIcons.converter} style={{ width: 28, height: 28 }} />
            </View>
            <Text style={styles.quickActionText} numberOfLines={2}>{t('dashboard.currencyConverter')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {currentAccountType === 'investment' && investmentSummary && (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push('/investment')}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t('investments.portfolio')}</Text>
            </View>
            <View style={styles.investmentRow}>
              <View style={styles.investmentCol}>
                <Text style={styles.investmentLabel}>{t('investments.totalValue')}</Text>
                <Text style={styles.investmentValue}>
                  {formatCurrency(convertAmount(investmentSummary.totalValue, 'USD', currency, rates), currency)}
                </Text>
              </View>
              <View style={styles.investmentCol}>
                <Text style={styles.investmentLabel}>{t('investments.dayChange')}</Text>
                <Text style={[
                  styles.investmentValue,
                  { color: investmentSummary.totalPnL >= 0 ? theme.colors.success : theme.colors.danger },
                ]}>
                  {investmentSummary.totalPnL >= 0 ? '+' : ''}
                  {formatCurrency(convertAmount(investmentSummary.totalPnL, 'USD', currency, rates), currency)}
                </Text>
              </View>
            </View>
            <Text style={styles.investmentHoldingsCount}>
              {t('investments.holdingsCount', { count: investmentSummary.holdings.length })}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.gamificationCard} activeOpacity={0.7} onPress={() => router.push('/achievements')}>
          <Text style={styles.gamificationDate}>
            {new Date().toLocaleDateString(getIntlLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
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

        {(lentDebts.length > 0 || borrowedDebts.length > 0) && (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push('/debts')}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t('debt.debtsAndLoans')}</Text>
            </View>
            <View style={styles.debtRow}>
              <View style={styles.debtCol}>
                <Ionicons name="arrow-up-circle-outline" size={20} color={theme.colors.success} />
                <Text style={styles.debtLabel}>{t('debt.peopleOweYou')}</Text>
                <Text style={[styles.debtAmount, { color: theme.colors.success }]}>
                  {formatCurrency(convertedLentTotal, currency)}
                </Text>
              </View>
              <View style={styles.debtDivider} />
              <View style={styles.debtCol}>
                <Ionicons name="arrow-down-circle-outline" size={20} color={theme.colors.danger} />
                <Text style={styles.debtLabel}>{t('debt.youOwe')}</Text>
                <Text style={[styles.debtAmount, { color: theme.colors.danger }]}>
                  {formatCurrency(convertedBorrowedTotal, currency)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        <NetProfitWidget refreshKey={widgetRefreshKey} />
        <NetCapitalWidget />

        <FatFinderCard />

        <GoalsCard />

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
  // Orange Hero Header — paddingBottom creates room for top half of quick action icons
  heroHeader: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: 24, // = ICON_BOX / 2
  },
  heroTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[3],
  },
  settingsButton: {
    width: 36,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 18,
  },
  welcomeText: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 18,
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center' as const,
  },
  // Quick actions row — sits between header and ScrollView, overlaps header by 24px
  quickActionsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-evenly' as const,
    marginTop: -24, // pulls top half of icons into orange header
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    zIndex: 1,
  },
  quickActionButton: {
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    flex: 1,
  },
  quickActionIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.isDark ? 0.5 : 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  quickActionImage: {
    width: 28,
    height: 28,
    resizeMode: 'contain' as const,
  },
  quickActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  // Scroll content
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  cardHeader: {
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[4],
  },
  cardTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  incomeAmount: {
    fontSize: 28,
    fontFamily: theme.fonts.bold,
    color: theme.colors.primary,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
  },
  expenseTotalAmount: {
    fontSize: 28,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
  },
  remainingAmount: {
    fontSize: 28,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    fontWeight: '900' as const,
  },
  budgetOverview: {
    gap: theme.spacing[4],
  },
  budgetAmount: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[2],
    justifyContent: 'center' as const,
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
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  gamificationDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[3],
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
    color: '#FFFFFF',
    textAlign: 'center' as const,
    marginTop: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    alignSelf: 'center' as const,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden' as const,
  },
  investmentRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[4],
  },
  investmentCol: {
    flex: 1,
  },
  investmentLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  investmentValue: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  investmentHoldingsCount: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[3],
  },
  debtRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  debtCol: {
    flex: 1,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  debtDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.borderLight,
    marginHorizontal: theme.spacing[2],
  },
  debtLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  debtAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
});
