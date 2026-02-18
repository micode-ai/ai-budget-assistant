import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/stores/authStore';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { initializeDatabase } from '@/db/client';
import { loadSavedLanguage } from '@/i18n';
import { ThemeProvider, useTheme } from '@/theme';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  handleNotificationResponse,
} from '@/services/notifications';

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
  const { isInitializing, isAuthenticated, initialize } = useAuthStore();
  const { t } = useTranslation();
  const theme = useTheme();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        await initializeDatabase();
        await loadSavedLanguage();
        await initialize();
      } catch (e) {
        console.warn('Error initializing app:', e);
      }
    }

    prepare();
  }, [initialize]);

  // Register push notifications when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotifications();
    }
  }, [isAuthenticated]);

  // Set up notification listeners
  useEffect(() => {
    const cleanup = setupNotificationListeners();

    // Handle notification that launched the app (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    return cleanup;
  }, []);

  useEffect(() => {
    if (!isInitializing && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isInitializing, fontsLoaded]);

  if (isInitializing || !fontsLoaded) {
    return null;
  }

  const headerStyle = {
    backgroundColor: theme.colors.primary,
  };
  const headerTintColor = theme.colors.textInverse;
  const headerTitleStyle = {
    fontFamily: theme.fonts.semiBold,
  };

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle,
          headerTintColor,
          headerTitleStyle,
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
          name="expense/[id]"
          options={{
            headerShown: true,
            title: t('nav.expenseDetails'),
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
          name="wallet/exchange"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('exchange.title'),
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
          name="settings"
          options={{
            headerShown: true,
            title: t('nav.settings'),
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
          name="income/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: t('nav.newIncome'),
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
      </Stack>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  return (
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
  );
}
