import React from 'react';
import { useIsDesktopWeb } from '@/components/webLayout.constants';
import { SettingsScreenFrame } from './SettingsScreenFrame';
import { SettingsShell } from './SettingsShell';
import type { SettingsRouteProps } from './SettingsRoute.types';

/**
 * The one place a settings route decides mobile vs desktop, and it decides on
 * width alone.
 *
 * At or above `DESKTOP_MIN_WIDTH` the screen becomes the right pane of the
 * shell and the left pane comes with it; below it, the browser gets exactly
 * what a phone gets. This is why every route file keeps existing rather than
 * being replaced by `app/settings/_layout.tsx`: the selection is the URL, so a
 * bookmark and a reload both work with no routing change at all, and seventeen
 * mechanical one-line files beat one clever change to app-wide routing.
 */
export function SettingsRoute({ screen, children }: SettingsRouteProps) {
  const isDesktop = useIsDesktopWeb();

  if (!isDesktop) {
    return <SettingsScreenFrame>{children}</SettingsScreenFrame>;
  }

  return <SettingsShell selected={screen}>{children}</SettingsShell>;
}
