import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ConsentView } from '@/components/oauth-consent/ConsentView';
import { HeaderHomeBack } from '@/components/oauth-consent/HeaderHomeBack';

/**
 * OAuth consent page (Public API phase 1) — `app.ai-budget.pl/authorize?response_type=code&…`.
 * Thin route: the header's fallback back arrow, then `ConsentView` (phone / desktop split inside).
 * Not to be confused with `app/oauth.tsx`, the Google sign-in relay landing.
 */
export default function AuthorizeScreen() {
  const params = useLocalSearchParams();
  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: router.canGoBack()
            ? undefined
            : ({ tintColor }) => <HeaderHomeBack tintColor={tintColor} />,
        }}
      />
      <ConsentView params={params} />
    </>
  );
}
