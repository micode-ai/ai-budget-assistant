import { useMemo } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { useAuthRequest, ResponseType, makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { Platform } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { secureStorage } from '@/services/secureStorage';

WebBrowser.maybeCompleteAuthSession();

export type GoogleSignInOutcome = 'success' | 'dismissed' | 'error';

// Google Console Web Client only accepts HTTPS redirect URIs (not budget://), so on
// native Google redirects to this HTTPS relay, which JS-redirects to budget://oauth?...
// expo-router routes that deep link to app/oauth.tsx, which completes the sign-in.
// TRAILING SLASH IS REQUIRED: /oauth/callback (no slash) 301-redirects to
// http://.../oauth/callback/ (scheme downgrade), and the #id_token fragment is lost
// across that hop. /oauth/callback/ serves 200 directly. The Google Console
// Authorized redirect URI must match this exactly, including the slash.
const RELAY_URI = 'https://ai-budget.pl/oauth/callback/';
const IS_NATIVE = Platform.OS !== 'web';

// CSRF protection: the random `state` is persisted before opening the browser and
// verified in app/oauth.tsx against what Google echoes back.
export const OAUTH_STATE_STORAGE_KEY = 'google_oauth_state';

function rnd(): string {
  const bytes = new Uint8Array(16);
  Crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function useGoogleAuth() {
  // Google's OpenID implicit flow (response_type=id_token) REQUIRES a `nonce`.
  // The generic `useAuthRequest` (unlike `Google.useAuthRequest`) does not add
  // one, so without this the web sign-in fails with "Error 400: invalid_request
  // / GeneralOAuthFlow". The native path adds its own nonce in signInNative().
  // Generated once per hook instance so the request isn't rebuilt every render.
  const nonce = useMemo(() => rnd(), []);

  // Web path uses expo-auth-session directly (redirect derived from the page origin).
  const [request, , promptAsync] = useAuthRequest(
    {
      responseType: ResponseType.IdToken,
      clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
      redirectUri: IS_NATIVE ? RELAY_URI : makeRedirectUri(),
      scopes: ['openid', 'profile', 'email'],
      usePKCE: false,
      extraParams: { nonce },
    },
    Google.discovery
  );

  // Native: open Google consent in a Custom Tab. Google -> HTTPS relay -> budget://oauth
  // -> app/oauth.tsx finishes the login and navigates. We do NOT await a result here:
  // openAuthSessionAsync's deep-link catch races with expo-router's built-in linking and
  // loses (the router renders "Unmatched route"), so we let the router own the redirect.
  const signInNative = async (): Promise<GoogleSignInOutcome> => {
    const state = rnd();
    // Persist state so app/oauth.tsx can verify Google echoed it back (CSRF guard).
    await secureStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);
    const params = new URLSearchParams({
      client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
      redirect_uri: RELAY_URI,
      response_type: 'id_token',
      scope: 'openid profile email',
      state,
      nonce: rnd(),
    });
    await WebBrowser.openBrowserAsync(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );
    // Completion + navigation happen in app/oauth.tsx; nothing to report from here.
    return 'dismissed';
  };

  const signIn = async (language?: string): Promise<GoogleSignInOutcome> => {
    if (IS_NATIVE) return signInNative();

    const result = await promptAsync();
    if (!result || result.type === 'dismiss' || result.type === 'cancel') return 'dismissed';
    if (result.type !== 'success') return 'error';
    const idToken = (result.params as Record<string, string> | undefined)?.id_token;
    if (!idToken) return 'error';
    await useAuthStore.getState().googleLogin(idToken, language);
    return 'success';
  };

  return { signIn, isReady: IS_NATIVE ? true : !!request };
}
