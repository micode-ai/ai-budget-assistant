import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { ChildrenSettings } from '@/components/children/ChildrenSettings';

/**
 * Settings → Children. Thin, like every reference-data route: `SettingsRoute`
 * decides phone vs desktop pane on width; the body lives under `src/`.
 */
export default function ChildrenSettingsScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('children.title') }} />
      <SettingsRoute screen="children">
        <ChildrenSettings />
      </SettingsRoute>
    </>
  );
}
