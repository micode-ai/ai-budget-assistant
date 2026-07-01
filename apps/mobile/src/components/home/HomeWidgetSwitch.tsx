import { View, Text, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { WidgetKey } from '@/stores/widgetVisibilityStore';
import type { DebtSummary } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { convertAmount } from '@/stores/exchangeRateStore';
import { NetProfitWidget, NetCapitalWidget, CalendarWidget, FinancialHealthWidget, FamilyFeedWidget } from '@/components/widgets';
import { FatFinderCard } from '@/components/insights/FatFinderCard';
import { GoalsCard } from '@/components/goals/GoalsCard';
import type { UseHomeScreenDataReturn } from '@/hooks/useHomeScreenData';

export interface HomeWidgetContext {
  widgetVisibility: UseHomeScreenDataReturn['widgetVisibility'];
  monthlyBudgetSummary: UseHomeScreenDataReturn['monthlyBudgetSummary'];
  remaining: number;
  totalBudget: number;
  budgetUsedPercent: number;
  convertedIncomeTotal: number;
  convertedExpenseTotal: number;
  currency: string;
  lentDebts: DebtSummary[];
  borrowedDebts: DebtSummary[];
  convertedLentTotal: number;
  convertedBorrowedTotal: number;
  widgetRefreshKey: number;
  walletSummary: UseHomeScreenDataReturn['walletSummary'];
  canEdit: boolean;
  level: number;
  levelProgress: number;
  currentStreak: number;
  investmentSummary: UseHomeScreenDataReturn['investmentSummary'];
  currentAccountType: UseHomeScreenDataReturn['currentAccountType'];
  rates: Record<string, number>;
}

/** The investment-portfolio card — only rendered when the current account is an investment account. */
export function InvestmentCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { investmentSummary, currency, rates } = ctx;

  if (!investmentSummary) return null;

  return (
    <TouchableOpacity key="investment" style={styles.card} activeOpacity={0.7} onPress={() => router.push('/investment')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
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
  );
}

function GamificationCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { level, levelProgress, currentStreak } = ctx;

  return (
    <TouchableOpacity key="gamification" style={styles.gamificationCard} activeOpacity={0.7} onPress={() => router.push('/achievements')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
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
  );
}

function MonthlyBudgetCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { remaining, currency, totalBudget, budgetUsedPercent } = ctx;

  const progressColor = budgetUsedPercent > 90
    ? theme.colors.danger
    : budgetUsedPercent > 70
      ? theme.colors.warning
      : theme.colors.primary;

  return (
    <TouchableOpacity key="monthlyBudget" style={styles.card} activeOpacity={0.7} onPress={() => router.push('/(tabs)/budgets')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
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
  );
}

function IncomeExpensesCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { convertedIncomeTotal, convertedExpenseTotal, currency } = ctx;

  return (
    <TouchableOpacity key="incomeExpenses" style={styles.card} activeOpacity={0.7} onPress={() => router.push({ pathname: '/(tabs)/expenses' })}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.incomeExpenseRow}>
        <View style={styles.incomeExpenseCol}>
          <Text style={styles.incomeExpenseLabel}>{t('dashboard.totalIncome')}</Text>
          <Text style={styles.incomeAmount}>+{formatCurrency(convertedIncomeTotal, currency)}</Text>
        </View>
        <View style={styles.incomeExpenseDivider} />
        <View style={styles.incomeExpenseCol}>
          <Text style={styles.incomeExpenseLabel}>{t('dashboard.totalExpenses')}</Text>
          <Text style={styles.expenseTotalAmount}>-{formatCurrency(convertedExpenseTotal, currency)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function DebtsCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { lentDebts, borrowedDebts, convertedLentTotal, convertedBorrowedTotal, currency } = ctx;

  return (
    <TouchableOpacity key="debts" style={styles.card} activeOpacity={0.7} onPress={() => router.push('/debts')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t('debt.debtsAndLoans')}</Text>
      </View>
      {lentDebts.length > 0 || borrowedDebts.length > 0 ? (
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
      ) : (
        <View style={styles.debtEmptyState}>
          <Ionicons name="people-outline" size={32} color={theme.colors.textDisabled} />
          <Text style={styles.debtEmptyText}>{t('debt.noDebts')}</Text>
          <View style={styles.debtAddButton}>
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.debtAddButtonText}>{t('debt.addDebt')}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

function WalletsSection({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { walletSummary, canEdit } = ctx;

  return (
    <View key="wallets" style={styles.section}>
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
          contentContainerStyle={[styles.walletGrid, Platform.OS === 'web' && styles.webCenterRow]}
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
  );
}

/**
 * Renders the dashboard card/widget for a given WidgetKey, or null when the
 * widget is hidden / has no data to show. Mirrors the switch previously
 * inline in DashboardScreen — same cases, same ordering, same guard conditions.
 */
export function renderHomeWidget(key: WidgetKey, ctx: HomeWidgetContext) {
  const { widgetVisibility, monthlyBudgetSummary, widgetRefreshKey, currentAccountType } = ctx;

  switch (key) {
    case 'safeToSpend':
      // Shown as the home hero number (tap → breakdown sheet). No duplicate
      // dashboard card — the hero is the single in-app surface for this value.
      return null;

    case 'familyFeed':
      return widgetVisibility.familyFeed && currentAccountType !== 'personal'
        ? <FamilyFeedWidget key="familyFeed" />
        : null;

    case 'financialHealth':
      return widgetVisibility.financialHealth ? <FinancialHealthWidget key="financialHealth" /> : null;

    case 'gamification':
      return widgetVisibility.gamification ? <GamificationCard key="gamification" ctx={ctx} /> : null;

    case 'monthlyBudget':
      return widgetVisibility.monthlyBudget && monthlyBudgetSummary.budgetCount > 0 ? (
        <MonthlyBudgetCard key="monthlyBudget" ctx={ctx} />
      ) : null;

    case 'incomeExpenses':
      return widgetVisibility.incomeExpenses ? <IncomeExpensesCard key="incomeExpenses" ctx={ctx} /> : null;

    case 'debts':
      return widgetVisibility.debts ? <DebtsCard key="debts" ctx={ctx} /> : null;

    case 'netProfit':
      return widgetVisibility.netProfit ? <NetProfitWidget key="netProfit" refreshKey={widgetRefreshKey} /> : null;

    case 'netCapital':
      return widgetVisibility.netCapital ? <NetCapitalWidget key="netCapital" /> : null;

    case 'fatFinder':
      return widgetVisibility.fatFinder ? <FatFinderCard key="fatFinder" /> : null;

    case 'calendar':
      return widgetVisibility.calendar ? <CalendarWidget key="calendar" refreshKey={widgetRefreshKey} /> : null;

    case 'goals':
      return widgetVisibility.goals ? <GoalsCard key="goals" /> : null;

    case 'wallets':
      return widgetVisibility.wallets ? <WalletsSection key="wallets" ctx={ctx} /> : null;

    default:
      return null;
  }
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  chevronHint: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
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
  incomeExpenseRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  incomeExpenseCol: {
    flex: 1,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  incomeExpenseDivider: {
    width: 1,
    height: 48,
    backgroundColor: theme.colors.borderLight,
  },
  incomeExpenseLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    fontWeight: '700' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[4],
    overflow: 'hidden' as const,
    textAlign: 'center' as const,
  },
  incomeAmount: {
    fontSize: 20,
    fontFamily: theme.fonts.bold,
    color: theme.colors.primary,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
  },
  expenseTotalAmount: {
    fontSize: 20,
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
  // Web no-op kept so the JSX style array stays valid (grid already centers).
  webCenterRow: {
    justifyContent: 'center' as const,
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
  debtEmptyState: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[4],
    gap: theme.spacing[2],
  },
  debtEmptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  debtAddButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  debtAddButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
