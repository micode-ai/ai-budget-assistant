import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { DatabaseProvider } from '@/db/DatabaseProvider';

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

  useEffect(() => {
    async function prepare() {
      try {
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
                  title: 'New Expense',
                }}
              />
              <Stack.Screen
                name="expense/[id]"
                options={{
                  headerShown: true,
                  title: 'Expense Details',
                }}
              />
              <Stack.Screen
                name="budget/new"
                options={{
                  presentation: 'modal',
                  headerShown: true,
                  title: 'New Budget',
                }}
              />
              <Stack.Screen
                name="budget/[id]"
                options={{
                  headerShown: true,
                  title: 'Budget Details',
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
