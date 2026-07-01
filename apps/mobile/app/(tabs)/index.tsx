import { View, ScrollView, RefreshControl } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, useStyles, type Theme } from '@/theme';
import { NewBadgeModal } from '@/components/gamification/NewBadgeModal';
import { useIsDesktopWeb } from '@/components/webLayout.constants';
import { useHomeScreenData } from '@/hooks/useHomeScreenData';
import { HomeHeroHeader } from '@/components/home/HomeHeroHeader';
import { HomeQuickActionStrip } from '@/components/home/HomeQuickActionStrip';
import { SafeToSpendSheet } from '@/components/home/SafeToSpendSheet';
import { InvestmentCard, renderHomeWidget, type HomeWidgetContext } from '@/components/home/HomeWidgetSwitch';
import type { QuickActionKey } from '@/stores/quickActionStore';

export default function DashboardScreen() {
  const [safeToSpendSheetVisible, setSafeToSpendSheetVisible] = useState(false);
  const theme = useTheme();
  const styles = useStyles(createStyles);
  // On desktop web the full-width WebTopBar carries the account/currency/alerts/
  // settings controls, so the hero's control row + divider are hidden there.
  const isDesktopWeb = useIsDesktopWeb();

  const {
    canEdit,
    currency,
    walletSummary,
    convertedIncomeTotal,
    convertedExpenseTotal,
    level,
    levelProgress,
    currentStreak,
    investmentSummary,
    lentDebts,
    borrowedDebts,
    convertedLentTotal,
    convertedBorrowedTotal,
    currentAccountType,
    widgetVisibility,
    widgetOrder,
    quickActionVisibility,
    quickActionOrder,
    unreadAlertCount,
    monthlyBudgetSummary,
    totalBudget,
    budgetUsedPercent,
    remaining,
    refreshing,
    widgetRefreshKey,
    onRefresh,
    safeToSpendData,
    hasSafeToSpend,
    rates,
  } = useHomeScreenData();

  // De-dupe so a duplicate in the stored order can't render an action twice.
  const visibleQuickActions: QuickActionKey[] = [...new Set(quickActionOrder)].filter((k) => quickActionVisibility[k]);
  // The header's bottom padding only exists to let the strip's icons overlap up
  // into the orange. With no strip (viewer role, or every action hidden), drop it.
  const showQuickActions = canEdit && visibleQuickActions.length > 0;

  const widgetCtx: HomeWidgetContext = {
    widgetVisibility,
    monthlyBudgetSummary,
    remaining,
    totalBudget,
    budgetUsedPercent,
    convertedIncomeTotal,
    convertedExpenseTotal,
    currency,
    lentDebts,
    borrowedDebts,
    convertedLentTotal,
    convertedBorrowedTotal,
    widgetRefreshKey,
    walletSummary,
    canEdit,
    level,
    levelProgress,
    currentStreak,
    investmentSummary,
    currentAccountType,
    rates,
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Orange Hero Header — the controls row + divider are hidden on desktop
          web, where WebTopBar provides account/currency/alerts/settings. */}
      {!isDesktopWeb && (
        <HomeHeroHeader
          showQuickActions={showQuickActions}
          unreadAlertCount={unreadAlertCount}
          showSafeToSpend={widgetVisibility.safeToSpend}
          hasSafeToSpend={hasSafeToSpend}
          safeToSpendData={safeToSpendData}
          onOpenSafeToSpend={() => setSafeToSpendSheetVisible(true)}
        />
      )}

      {/* Quick Actions — wrapping grid (4 per row); extra rows push content down */}
      {showQuickActions && (
        <HomeQuickActionStrip visibleQuickActions={visibleQuickActions} isDesktopWeb={isDesktopWeb} />
      )}

      {/* Safe-to-Spend breakdown bottom-sheet */}
      <SafeToSpendSheet
        visible={safeToSpendSheetVisible}
        onClose={() => setSafeToSpendSheetVisible(false)}
        data={safeToSpendData}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {(() => {
          const investmentEl = currentAccountType === 'investment' && investmentSummary ? (
            <InvestmentCard key="investment" ctx={widgetCtx} />
          ) : null;

          // De-dupe at the render site: a duplicate key in the stored order
          // would render the same widget twice (doubled card + broken modal).
          const mapped = [...new Set(widgetOrder)].map((key) => renderHomeWidget(key, widgetCtx));

          const els = [investmentEl, ...mapped].filter(Boolean);
          if (!isDesktopWeb) return els;

          // Desktop web: lay the widgets out in two balanced columns
          // (alternating by display order) so the wide viewport isn't a
          // single sparse column. Native/narrow web keep the 1-col list.
          const leftCol = els.filter((_, i) => i % 2 === 0);
          const rightCol = els.filter((_, i) => i % 2 === 1);
          return (
            <View style={styles.webTwoCol}>
              <View style={styles.webCol}>{leftCol}</View>
              <View style={styles.webCol}>{rightCol}</View>
            </View>
          );
        })()}

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
  // Desktop web: two side-by-side widget columns. Each column stacks its cards
  // (cards keep their own marginBottom); columnGap separates the two columns.
  webTwoCol: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    columnGap: theme.spacing[4],
  },
  webCol: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
});
