import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { AccountsSettings } from '@/components/settings/accounts/AccountsSettings';

/**
 * The route stays single and keeps its registration in `app/_layout.tsx`
 * untouched beyond the `headerShown` flip every promoted pane gets:
 * `SettingsRoute` is the one file that decides mobile vs desktop, on width
 * alone. Below `DESKTOP_MIN_WIDTH`, and on native, it renders the screen
 * inside exactly the tree this file used to hold itself.
 *
 * No `<Stack.Screen>` sibling here, unlike `tags/manage.tsx`/`projects/index.tsx`
 * — this route never had one. Its title has only ever come from its own
 * registration in `app/_layout.tsx` (`name="account/list"`), so there is
 * nothing to keep as a sibling of `SettingsRoute`.
 *
 * `app/account/[id].tsx`, `app/account/create.tsx` and `app/account/join.tsx`
 * are untouched: none is extracted, moved or dialog-hosted.
 */
export default function AccountListScreen() {
  return (
    <SettingsRoute screen="accounts">
      <AccountsSettings />
    </SettingsRoute>
  );
}
