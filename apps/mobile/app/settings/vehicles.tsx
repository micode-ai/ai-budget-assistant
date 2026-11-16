import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { VehiclesSettings } from '@/components/vehicles/VehiclesSettings';

/**
 * Settings → Vehicles (ABA-796). Thin, like every reference-data route:
 * `SettingsRoute` decides phone vs desktop pane on width; the body lives under `src/`.
 */
export default function VehiclesSettingsScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('vehicles.title') }} />
      <SettingsRoute screen="vehicles">
        <VehiclesSettings />
      </SettingsRoute>
    </>
  );
}
