import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { DevelopersSettings } from '@/components/settings/developers/DevelopersSettings';

/** Thin route: `SettingsRoute` decides mobile vs desktop pane; the body lives in `src/`. */
export default function DevelopersSettingsScreen() {
  return (
    <SettingsRoute screen="developers">
      <DevelopersSettings />
    </SettingsRoute>
  );
}
