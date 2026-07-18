import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';

/**
 * Handles deep links from widgets and external sources (`budget://` custom
 * scheme + `https://ai-budget.pl/...` universal links), excluding
 * `subscription/success|cancel` (handled by `WebBrowser.openAuthSessionAsync`)
 * and `trip-invite/` (handled by `useTripInviteDeepLink`).
 *
 * Gated only on `!isInitializing && isAuthenticated` — deliberately WITHOUT
 * `fontsLoaded`, unlike the notification/trip-invite flush gates. Do not
 * "fix" this to add fontsLoaded.
 */
export function useGenericDeepLink(isInitializing: boolean, isAuthenticated: boolean): void {
  const lastHandledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (isInitializing || !isAuthenticated) return;
    // Web: the browser URL is already the route and Expo Router handles it
    // natively. Running the custom-scheme deep-link logic here would treat the
    // domain as a path segment (budget://expense/voice puts the first segment
    // in URL.host), turning https://ai-budget.pl/expenses into a push to
    // "/ai-budget.pl/expenses" → https://ai-budget.pl/ai-budget.pl/expenses.
    if (Platform.OS === 'web') return;
    function navigateToDeepLink(url: string) {
      // Subscription deep links are handled by WebBrowser.openAuthSessionAsync — ignore here
      if (url.includes('subscription/success') || url.includes('subscription/cancel')) return;

      // Trip-invite links are handled by the dedicated capture/flush effects above —
      // ignore here to avoid a duplicate push to an unmatched "/trip-invite/<code>" route.
      if (url.includes('trip-invite/')) return;

      // Prevent duplicate navigation for the same URL
      if (lastHandledUrl.current === url) return;
      lastHandledUrl.current = url;
      // Reset after a short delay to allow re-tapping the same widget later
      setTimeout(() => { lastHandledUrl.current = null; }, 1000);

      // Parse path from custom scheme URI: budget:///expense/voice → /expense/voice
      let fullPath: string | null = null;
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          // http(s) link (App Link / Universal Link): host is the domain, not a
          // path segment — the pathname already IS the route.
          const p = parsed.pathname + parsed.search;
          if (p && p !== '/') fullPath = p;
        } else {
          // Custom scheme: budget://expense/voice has host="expense", path="/voice"
          const path = parsed.pathname || parsed.host;
          if (path && path !== '/') {
            fullPath = parsed.host ? `/${parsed.host}${parsed.pathname}` : parsed.pathname;
          }
        }
      } catch {
        // Fallback: strip scheme manually
        fullPath = url.replace(/^[^:]+:\/\/\/?/, '/');
        if (fullPath === '/') fullPath = null;
      }

      if (fullPath) {
        router.push(fullPath as any);
      }
    }

    // Handle URL that launched the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) navigateToDeepLink(url);
    });

    // Handle URLs when app is already running (warm start)
    const sub = Linking.addEventListener('url', (event) => {
      if (event.url) navigateToDeepLink(event.url);
    });
    return () => sub.remove();
  }, [isInitializing, isAuthenticated]);
}
