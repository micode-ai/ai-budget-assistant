import React from 'react';
import { SettingsScreenFrame } from './SettingsScreenFrame';
import type { SettingsRouteProps } from './SettingsRoute.types';

/**
 * Native. There is no desktop on a phone, so a settings route is the screen
 * inside its frame and nothing else — this file imports no shell, no registry
 * and no left pane, so Metro's native graph never reaches any of it.
 *
 * The web counterpart is `SettingsRoute.web.tsx`. This is a real no-op split,
 * not a re-export of the web file: a re-export would drag the desktop tree
 * into the app users install, which is exactly what the split exists to
 * prevent.
 */
export function SettingsRoute({ children }: SettingsRouteProps) {
  return <SettingsScreenFrame>{children}</SettingsScreenFrame>;
}
