import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { PetsSettings } from '@/components/pets/PetsSettings';

/**
 * Settings → Pets (ABA-831). Thin, like every reference-data route:
 * `SettingsRoute` decides phone vs desktop pane on width; the body lives under `src/`.
 */
export default function PetsSettingsScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('pets.title') }} />
      <SettingsRoute screen="pets">
        <PetsSettings />
      </SettingsRoute>
    </>
  );
}
