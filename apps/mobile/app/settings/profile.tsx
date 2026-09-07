import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { ProfileSettings } from '@/components/settings/profile/ProfileSettings';

/**
 * The route stays single and keeps its registration in `app/_layout.tsx`
 * untouched: `SettingsRoute` is the one file that decides mobile vs desktop,
 * on width alone. Below `DESKTOP_MIN_WIDTH`, and on native, it renders the
 * screen inside exactly the tree this file used to hold itself.
 *
 * The screen's body lives in `src/` because `src/` may not import from `app/`,
 * so a pane could otherwise never render it.
 */
export default function ProfileSettingsScreen() {
  return (
    <SettingsRoute screen="profile">
      <ProfileSettings />
    </SettingsRoute>
  );
}
