import type React from 'react';
import type { SettingsPaneKey } from '@/features/settings/settingsRegistry';

/**
 * Declared apart from the two platform files so both are provably the same
 * gate — the `secureStorage`/`attribution`/`fileExport` convention in this
 * repo. A signature that drifts between the platform files is a difference in
 * behaviour that no test here can see, since nothing renders a component in CI.
 */
export interface SettingsRouteProps {
  /**
   * Which settings screen this route is. Only a `SettingsPaneKey` is
   * accepted, so a route outside `app/settings/` cannot be wired into the
   * shell without first being admitted to that type — which is the same thing
   * as admitting the screen has been moved.
   */
  screen: SettingsPaneKey;
  /** The extracted screen component. */
  children: React.ReactNode;
}
