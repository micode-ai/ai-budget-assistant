import { redirectHandedOffLink } from '@/features/launcherShortcuts/handOffDeepLinks';

/**
 * Expo Router's hook for incoming native URLs. Launcher-shortcut and widget links are
 * navigated by `useGenericDeepLink` only (after init and auth); see `handOffDeepLinks.ts`.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    return redirectHandedOffLink(path, initial);
  } catch {
    return initial ? '/' : path;
  }
}
