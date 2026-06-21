import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuthStore } from '@/stores/authStore';

WebBrowser.maybeCompleteAuthSession();

export type GoogleSignInOutcome = 'success' | 'dismissed' | 'error';

export function useGoogleAuth() {
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const signIn = async (language?: string): Promise<GoogleSignInOutcome> => {
    const result = await promptAsync();
    if (!result || result.type === 'dismiss' || result.type === 'cancel') {
      return 'dismissed';
    }
    if (result.type !== 'success') {
      return 'error';
    }
    const idToken = (result.params as Record<string, string> | undefined)?.id_token;
    if (!idToken) {
      return 'error';
    }
    await useAuthStore.getState().googleLogin(idToken, language);
    return 'success';
  };

  return { signIn, isReady: !!request };
}
