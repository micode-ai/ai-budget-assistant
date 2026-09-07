import React from 'react';
import { router } from 'expo-router';
import { ChangeEmailView } from '@/components/settings/profile/ChangeEmailView';

/**
 * Still a real route, and it has to stay one: it is what the phone opens, what
 * web below `DESKTOP_MIN_WIDTH` opens, and what the URL `/settings/change-email`
 * has always meant. Only desktop replaces it with a dialog, and only because a
 * pane has no back to return through.
 *
 * The body moved to `src/` so `ChangeEmailDialog` can host the same component
 * rather than reimplement a two-step flow whose halves are joined by a record
 * in `secureStorage`.
 */
export default function ChangeEmailScreen() {
  return <ChangeEmailView onDone={() => router.back()} />;
}
