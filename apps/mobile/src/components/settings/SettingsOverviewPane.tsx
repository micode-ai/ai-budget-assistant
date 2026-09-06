import React from 'react';
import { SettingsProfileCard, SettingsLogoutButton } from './SettingsIdentity';

/**
 * The right pane at `/settings` with nothing selected.
 *
 * Nothing is auto-selected, so the URL never claims a selection the user did
 * not make — and that leaves this pane to show the two things that belong to
 * settings as a whole rather than to any one category: who you are signed in
 * as, and signing out. Both already live on the hub, so this is real content
 * rather than a placeholder, and it is why the no-selection state needs no
 * copy of its own and no new i18n key.
 *
 * It owns no width of its own: the shell caps it exactly as it caps a form
 * pane, so there is one number and one rule rather than two.
 */
export function SettingsOverviewPane() {
  return (
    <>
      <SettingsProfileCard />
      <SettingsLogoutButton />
    </>
  );
}
