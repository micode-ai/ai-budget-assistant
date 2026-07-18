import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from '@expo-google-fonts/montserrat';
import { useAuthStore } from '@/stores/authStore';
import { initializeDatabase } from '@/db/client';
import { loadSavedLanguage } from '@/i18n';

export interface AppBootstrapState {
  fontsLoaded: boolean;
  isInitializing: boolean;
}

/**
 * Owns app cold-boot concerns: Montserrat font loading, the one-time
 * `prepare()` effect (SQLite init → saved-language load → auth
 * `initialize()`), and hiding the native splash screen once both fonts and
 * auth init are done.
 *
 * Returns the two booleans the rest of `RootNavigator` (and the sibling
 * deep-link hooks, via `useColdStartGate`) gate on.
 */
export function useAppBootstrap(): AppBootstrapState {
  const { isInitializing, initialize } = useAuthStore();

  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
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

  useEffect(() => {
    if (!isInitializing && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isInitializing, fontsLoaded]);

  return { fontsLoaded, isInitializing };
}
