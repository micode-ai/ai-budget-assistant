import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { ConnectedAppsSettings } from '@/components/settings/connected-apps/ConnectedAppsSettings';

/** Thin route: `SettingsRoute` decides mobile vs desktop pane; the body lives in `src/`. */
export default function ConnectedAppsSettingsScreen() {
  return (
    <SettingsRoute screen="connectedApps">
      <ConnectedAppsSettings />
    </SettingsRoute>
  );
}
