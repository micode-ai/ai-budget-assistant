import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { EmailReceiptsSettings } from '@/components/settings/email-receipts/EmailReceiptsSettings';

/** Thin route: `SettingsRoute` decides mobile vs desktop pane; the body lives in `src/`. */
export default function EmailReceiptsSettingsScreen() {
  return (
    <SettingsRoute screen="emailReceipts">
      <EmailReceiptsSettings />
    </SettingsRoute>
  );
}
