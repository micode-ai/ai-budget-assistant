import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { ProductsSettings } from '@/components/settings/products/ProductsSettings';

/**
 * The route stays single and keeps its registration in `app/_layout.tsx`
 * untouched: `SettingsRoute` is the one file that decides mobile vs desktop,
 * on width alone. Below `DESKTOP_MIN_WIDTH`, and on native, it renders the
 * screen inside exactly the tree this file used to hold itself.
 *
 * The screen's body lives in `src/` because `src/` may not import from `app/`,
 * so a pane could otherwise never render it.
 *
 * **The `<Stack.Screen>` stays here, and this is the only settings route that
 * has one.** `app/_layout.tsx` registers this screen with `settingsNav.products`
 * ("Products") and this overrides the title with `priceHistory.manageProducts`
 * ("Manage products"): expo-router's `Screen` merges through
 * `navigation.setOptions`, so it changes the title and nothing else, leaving
 * `headerShown` exactly as the registry decided. Dropping it would rename the
 * header on the phone, and moving it into the extracted body would put route
 * chrome under `src/`, where it would rename whichever route later hosts that
 * component. It stays a sibling of `SettingsRoute`, as it was a sibling of the
 * `SafeAreaView` before, so it is not part of what the pane renders.
 *
 * On desktop it is inert: a hosted route has no stack header, and the only
 * remaining effect is the browser tab title, which it already set before this
 * screen became a pane.
 */
export default function ProductsSettingsScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('priceHistory.manageProducts') }} />
      <SettingsRoute screen="products">
        <ProductsSettings />
      </SettingsRoute>
    </>
  );
}
