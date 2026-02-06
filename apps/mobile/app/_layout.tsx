import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { loadSavedLanguage } from '@/i18n';

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

export default function RootLayout() {
  const { isLoading, initialize } = useAuthStore();
  const { t } = useTranslation();

  useEffect(() => {
    async function prepare() {
      try {
        await loadSavedLanguage();
        await initialize();
      } catch (e) {
        console.warn('Error initializing app:', e);
      } finally {
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, [initialize]);

  if (isLoading) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <DatabaseProvider>
            <Stack screenOptions={{ headerShown: false }}>
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
            </Stack>
            <StatusBar style="auto" />
          </DatabaseProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
