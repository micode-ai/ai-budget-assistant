import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { ThemeProvider, useTheme } from '@/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { UpgradeGate } from '@/components/UpgradeGate';
import { WebShell } from '@/components/WebShell';
import { useOrientationLock } from '@/hooks/useOrientationLock';
import { useAppBootstrap } from '@/hooks/useAppBootstrap';
import { useColdStartGate } from '@/hooks/useColdStartGate';
import { useBankNotificationCapture } from '@/hooks/useBankNotificationCapture';
import { useAuthenticatedBootstrap } from '@/hooks/useAuthenticatedBootstrap';
import { useNotificationDeepLink } from '@/hooks/useNotificationDeepLink';
import { useTripInviteDeepLink } from '@/hooks/useTripInviteDeepLink';
import { useGenericDeepLink } from '@/hooks/useGenericDeepLink';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
    },
  },
});

function RootNavigator() {
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const theme = useTheme();

  useOrientationLock();

  const { fontsLoaded, isInitializing } = useAppBootstrap();
  const coldStartGateReady = useColdStartGate({ isInitializing, isAuthenticated, fontsLoaded });

  useAuthenticatedBootstrap(isAuthenticated);
  useBankNotificationCapture();
  useNotificationDeepLink(coldStartGateReady);
  useTripInviteDeepLink(coldStartGateReady, t);
  useGenericDeepLink(isInitializing, isAuthenticated);

  if (isInitializing || !fontsLoaded) {
    return null;
  }

  const headerStyle = {
    backgroundColor: theme.colors.primary,
  };
  const headerTintColor = theme.colors.textInverse;
  const headerTitleStyle = {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
  };

  return (
    <>
      <WebShell>
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle,
            headerTintColor,
            headerTitleStyle,
            headerTitleAlign: 'center',
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="expense/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('nav.newExpense'),
          }}
        />
        <Stack.Screen
          name="expense/location"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('location.pickerTitle'),
          }}
        />
        <Stack.Screen
          name="expense/voice"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('voice.title'),
            headerRight: () => <AiUsageBadge />,
          }}
        />
        <Stack.Screen
          name="expense/receipt"
          options={{
            presentation: 'modal',
            headerShown: false,
            title: t('receipt.title'),
          }}
        />
        <Stack.Screen
          name="expense/[id]"
          options={{
            headerShown: true,
            title: t('nav.expenseDetails'),
          }}
        />
        <Stack.Screen
          name="expense/merge"
          options={{
            headerShown: true,
            title: t('expenses.merge.title'),
          }}
        />
        <Stack.Screen
          name="expense/split"
          options={{
            headerShown: true,
            title: t('receiptSplit.title'),
          }}
        />
        <Stack.Screen
          name="budget/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('nav.newBudget'),
          }}
        />
        <Stack.Screen
          name="budget/[id]"
          options={{
            headerShown: true,
            title: t('nav.budgetDetails'),
          }}
        />
        <Stack.Screen
          name="account/list"
          options={{
            headerShown: true,
            title: t('nav.accounts'),
          }}
        />
        <Stack.Screen
          name="account/create"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('nav.createAccount'),
          }}
        />
        <Stack.Screen
          name="trip/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('trip.createTrip'),
          }}
        />
        <Stack.Screen
          name="trip/[id]/settle-up"
          options={{
            headerShown: true,
            title: t('trip.settleUp'),
          }}
        />
        <Stack.Screen
          name="trip/payment-settings"
          options={{
            headerShown: true,
            title: t('trip.paymentSettingsTitle'),
          }}
        />
        <Stack.Screen
          name="account/[id]"
          options={{
            headerShown: true,
            title: t('nav.accountSettings'),
          }}
        />
        <Stack.Screen
          name="account/invite"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('nav.inviteMember'),
          }}
        />
        <Stack.Screen
          name="account/join"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('nav.joinAccount'),
          }}
        />
        <Stack.Screen
          name="wallet/index"
          options={{
            headerShown: true,
            title: t('wallet.title'),
          }}
        />
        <Stack.Screen
          name="wallet/set-balance"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('wallet.setInitialBalance'),
          }}
        />
        <Stack.Screen
          name="wallet/exchange/index"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('exchange.title'),
          }}
        />
        <Stack.Screen
          name="wallet/exchange/[id]"
          options={{
            headerShown: true,
            title: t('exchange.editTitle'),
          }}
        />
        <Stack.Screen
          name="wallet/transfer"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('transfer.title'),
          }}
        />
        <Stack.Screen
          name="wallet/transfers"
          options={{
            headerShown: true,
            title: t('transfer.allTransfers'),
          }}
        />
        <Stack.Screen
          name="wallet/exchanges"
          options={{
            headerShown: true,
            title: t('exchange.allExchanges'),
          }}
        />
        <Stack.Screen
          name="calendar/index"
          options={{
            headerShown: true,
            title: t('calendar.title'),
          }}
        />
        <Stack.Screen
          name="converter"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('converter.title'),
          }}
        />
        <Stack.Screen
          name="welcome"
          options={{
            headerShown: true,
            title: '',
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="subscription"
          options={{
            headerShown: true,
            title: t('subscription.title'),
          }}
        />
        <Stack.Screen
          name="admin"
          options={{
            headerShown: true,
            title: t('nav.adminPanel'),
          }}
        />
        <Stack.Screen
          name="settings/index"
          options={{
            headerShown: true,
            title: t('nav.settings'),
          }}
        />
        <Stack.Screen
          name="settings/profile"
          options={{
            headerShown: true,
            title: t('settingsNav.profile'),
          }}
        />
        <Stack.Screen
          name="settings/appearance"
          options={{
            headerShown: true,
            title: t('settingsNav.appearance'),
          }}
        />
        <Stack.Screen
          name="settings/ai"
          options={{
            headerShown: true,
            title: t('settingsNav.ai'),
          }}
        />
        <Stack.Screen
          name="settings/widgets"
          options={{
            headerShown: true,
            title: t('settingsNav.widgets'),
          }}
        />
        <Stack.Screen
          name="settings/notifications"
          options={{
            headerShown: true,
            title: t('settingsNav.notifications'),
          }}
        />
        <Stack.Screen
          name="settings/security"
          options={{
            headerShown: true,
            title: t('settingsNav.security'),
          }}
        />
        <Stack.Screen
          name="settings/data"
          options={{
            headerShown: true,
            title: t('settingsNav.data'),
          }}
        />
        <Stack.Screen
          name="settings/about"
          options={{
            headerShown: true,
            title: t('settingsNav.about'),
          }}
        />
        <Stack.Screen
          name="settings/ai-usage-details"
          options={{
            headerShown: true,
            title: t('aiUsage.totalUsed'),
          }}
        />
        <Stack.Screen
          name="settings/bots"
          options={{
            headerShown: true,
            title: t('settings.bots.title'),
          }}
        />
        <Stack.Screen
          name="settings/wise-import"
          options={{
            headerShown: true,
            title: t('wiseImport.title'),
          }}
        />
        <Stack.Screen
          name="settings/import/index"
          options={{
            headerShown: true,
            title: t('bankImport.title'),
          }}
        />
        <Stack.Screen
          name="settings/import/preview"
          options={{
            headerShown: true,
            title: t('bankImport.title'),
          }}
        />
        <Stack.Screen
          name="settings/import/mapper"
          options={{
            headerShown: true,
            title: t('bankImport.mapperTitle'),
          }}
        />
        <Stack.Screen
          name="settings/import/request-bank"
          options={{
            headerShown: true,
            title: t('bankImport.requestTitle'),
          }}
        />
        <Stack.Screen
          name="settings/auto-capture"
          options={{
            headerShown: true,
            title: t('autoCapture.title'),
          }}
        />
        <Stack.Screen
          name="settings/categories"
          options={{
            headerShown: true,
            title: t('settingsNav.categories'),
          }}
        />
        <Stack.Screen
          name="settings/merchants"
          options={{
            headerShown: true,
            title: t('settingsNav.merchants'),
          }}
        />
        <Stack.Screen
          name="settings/products"
          options={{
            headerShown: true,
            title: t('settingsNav.products'),
          }}
        />
        <Stack.Screen
          name="settings/reference"
          options={{
            headerShown: true,
            title: t('settingsNav.referenceData'),
          }}
        />
        <Stack.Screen
          name="price-history/community"
          options={{
            headerShown: true,
            title: t('communityPrices.screenTitle'),
          }}
        />
        <Stack.Screen
          name="settings/change-email"
          options={{
            headerShown: true,
            title: t('changeEmail.title'),
          }}
        />
        <Stack.Screen
          name="help/index"
          options={{
            headerShown: true,
            title: t('help.title'),
          }}
        />
        <Stack.Screen
          name="help/[id]"
          options={{
            headerShown: true,
            title: t('help.articleTitle'),
          }}
        />
        <Stack.Screen
          name="reports"
          options={{
            headerShown: true,
            title: t('reports.title'),
          }}
        />
        <Stack.Screen
          name="analytics/drill-down"
          options={{
            headerShown: true,
            title: t('drillDown.title'),
          }}
        />
        <Stack.Screen
          name="story"
          options={{
            headerShown: true,
            title: t('story.title'),
          }}
        />
        <Stack.Screen
          name="wrapped/index"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="income/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('nav.newIncome'),
          }}
        />
        <Stack.Screen
          name="income/voice"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('incomeVoice.title'),
            headerRight: () => <AiUsageBadge />,
          }}
        />
        <Stack.Screen
          name="income/receipt"
          options={{
            presentation: 'modal',
            headerShown: false,
            title: t('incomeReceipt.title'),
          }}
        />
        <Stack.Screen
          name="income/[id]"
          options={{
            headerShown: true,
            title: t('nav.incomeDetails'),
          }}
        />
        <Stack.Screen
          name="projects/index"
          options={{
            headerShown: true,
            title: t('projects.title'),
          }}
        />
        <Stack.Screen
          name="projects/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('projects.createProject'),
          }}
        />
        <Stack.Screen
          name="projects/[id]"
          options={{
            headerShown: true,
            title: t('projects.title'),
          }}
        />
        <Stack.Screen
          name="tags/manage"
          options={{
            headerShown: true,
            title: t('tags.title'),
          }}
        />
        <Stack.Screen
          name="shopping-list/index"
          options={{
            headerShown: true,
            title: t('shoppingList.title'),
          }}
        />
        <Stack.Screen
          name="shopping-list/compare"
          options={{
            headerShown: true,
            title: t('shoppingList.compareTitle'),
          }}
        />
        <Stack.Screen
          name="shopping-list/map"
          options={{
            headerShown: true,
            title: t('shoppingList.mapTitle'),
          }}
        />
        <Stack.Screen
          name="investment/index"
          options={{
            headerShown: true,
            title: t('nav.investmentDashboard'),
          }}
        />
        <Stack.Screen
          name="investment/search"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('nav.assetSearch'),
          }}
        />
        <Stack.Screen
          name="investment/[holdingId]"
          options={{
            headerShown: true,
            title: t('nav.assetDetails'),
          }}
        />
        <Stack.Screen
          name="investment/transaction"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('nav.investmentTransaction'),
          }}
        />
        <Stack.Screen
          name="investment/analytics"
          options={{
            headerShown: true,
            title: t('nav.investmentAnalytics'),
          }}
        />
        <Stack.Screen
          name="debts/index"
          options={{
            headerShown: true,
            title: t('debt.debtsAndLoans'),
          }}
        />
        <Stack.Screen
          name="goals/index"
          options={{
            headerShown: true,
            title: t('goals.title'),
          }}
        />
        <Stack.Screen
          name="goals/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('goals.create'),
          }}
        />
        <Stack.Screen
          name="goals/[id]"
          options={{
            headerShown: true,
            title: t('goals.title'),
          }}
        />
        <Stack.Screen
          name="fat-finder"
          options={{
            headerShown: true,
            title: t('fatFinder.title'),
          }}
        />
        <Stack.Screen
          name="purchase-requests/index"
          options={{
            headerShown: true,
            title: t('purchaseRequests.title'),
          }}
        />
        <Stack.Screen
          name="inflation-shield/index"
          options={{
            headerShown: true,
            title: t('inflationShield.title'),
          }}
        />
        <Stack.Screen
          name="purchase-requests/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('purchaseRequests.new'),
          }}
        />
        <Stack.Screen
          name="purchase-requests/[id]"
          options={{
            headerShown: true,
            title: t('purchaseRequests.title'),
          }}
        />
        <Stack.Screen
          name="subscriptions/index"
          options={{
            headerShown: true,
            title: t('subscriptionManager.title'),
          }}
        />
        <Stack.Screen
          name="subscriptions/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('subscriptionManager.addTitle'),
          }}
        />
        <Stack.Screen
          name="subscriptions/[id]"
          options={{
            headerShown: true,
            title: t('subscriptionManager.editTitle'),
          }}
        />
        <Stack.Screen
          name="alerts/index"
          options={{
            headerShown: true,
            title: t('alerts.title'),
          }}
        />
        <Stack.Screen
          name="scenario-simulator"
          options={{
            headerShown: true,
            title: t('scenarioSimulator.title'),
          }}
        />
        <Stack.Screen
          name="family-feed/index"
          options={{
            headerShown: true,
            title: t('familyFeed.title'),
            headerBackTitle: '',
          }}
        />
        </Stack>
      </WebShell>
      <UpdatePrompt />
      <UpgradeGate />
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
              <DatabaseProvider>
                <RootNavigator />
              </DatabaseProvider>
            </QueryClientProvider>
          </SafeAreaProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
