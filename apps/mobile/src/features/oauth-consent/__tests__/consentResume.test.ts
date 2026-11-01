// Guard: `appStackRouteName` (used by useOAuthConsentResume) steps through expo-router's INTERNAL
// root wrapper by its name. That name is not public API; if an expo-router upgrade renames it, the
// resume hook would stop finding the app stack and a consent request stashed across sign-in would
// silently never reopen. This test fails on such an upgrade instead.
import { INTERNAL_SLOT_NAME } from 'expo-router/build/constants';
import { EXPO_ROUTER_ROOT_ROUTE, appStackRouteName } from '../consentResume';

describe('expo-router internal root route name', () => {
  it("still matches expo-router's INTERNAL_SLOT_NAME", () => {
    expect(EXPO_ROUTER_ROOT_ROUTE).toBe(INTERNAL_SLOT_NAME);
  });

  it('is what appStackRouteName steps into', () => {
    expect(
      appStackRouteName({ index: 0, routes: [{ name: INTERNAL_SLOT_NAME, state: { index: 0, routes: [{ name: '(tabs)' }] } }] }),
    ).toBe('(tabs)');
  });
});
