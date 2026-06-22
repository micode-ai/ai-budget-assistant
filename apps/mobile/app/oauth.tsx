import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import i18n from '@/i18n';
import { useTheme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { secureStorage } from '@/services/secureStorage';
import { OAUTH_STATE_STORAGE_KEY } from '@/features/auth/useGoogleAuth';

// Google OAuth relay landing (native sign-in, ABA-282).
// The relay page at https://ai-budget.pl/oauth/callback receives Google's id_token
// (returned in the URL fragment) and JS-redirects to budget://oauth?id_token=...
// expo-router routes that deep link HERE — we must own this route, because the
// router's built-in linking grabs the deep link before WebBrowser.openAuthSessionAsync
// can, and an unregistered path renders the "Unmatched route" screen. We complete the
// sign-in on this screen and replace into the app (or back to login on failure).
export default function OAuthCallbackScreen() {
  const params = useLocalSearchParams<{ id_token?: string; state?: string; error?: string }>();
  const theme = useTheme();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    // Close the Custom Tab that opened the Google consent screen.
    WebBrowser.dismissBrowser();

    const idToken = typeof params.id_token === 'string' ? params.id_token : undefined;
    const returnedState = typeof params.state === 'string' ? params.state : undefined;
    const hadError = typeof params.error === 'string' && params.error.length > 0;

    (async () => {
      const fail = () =>
        router.replace({ pathname: '/(auth)/login', params: { googleError: '1' } });

      // CSRF guard: verify Google echoed back the state we generated, then clear it.
      const expectedState = await secureStorage.getItem(OAUTH_STATE_STORAGE_KEY);
      await secureStorage.removeItem(OAUTH_STATE_STORAGE_KEY);

      if (!idToken || hadError || !expectedState || returnedState !== expectedState) {
        fail();
        return;
      }
      try {
        // Server verifies the id_token signature, audience, and email_verified.
        await useAuthStore.getState().googleLogin(idToken, i18n.language);
        router.replace('/(tabs)');
      } catch {
        fail();
      }
    })();
    // params is captured once via the handled guard; deliberately run-once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
