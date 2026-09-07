import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { TagsSettings } from '@/components/settings/tags/TagsSettings';

/**
 * The route stays single and keeps its registration in `app/_layout.tsx`
 * untouched beyond the `headerShown` flip every promoted pane gets:
 * `SettingsRoute` is the one file that decides mobile vs desktop, on width
 * alone. Below `DESKTOP_MIN_WIDTH`, and on native, it renders the screen
 * inside exactly the tree this file used to hold itself.
 *
 * This route was never under `app/settings/`, unlike the panes converted in
 * waves 1-3 — `tags/manage` is reached today from the "reference data" hub and
 * from nowhere else, and `SettingsRoute` does not care where the file that
 * calls it lives, only that `src/` cannot host it directly.
 *
 * The `<Stack.Screen>` title stays here, a sibling of `SettingsRoute`, rather
 * than moving into the extracted body — wave 3's ruling on where a route's own
 * chrome belongs.
 */
export default function ManageTagsScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('tags.manageTags') }} />
      <SettingsRoute screen="tags">
        <TagsSettings />
      </SettingsRoute>
    </>
  );
}
