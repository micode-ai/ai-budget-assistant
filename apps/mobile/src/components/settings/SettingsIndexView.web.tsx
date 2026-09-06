import React from 'react';
import { useIsDesktopWeb } from '@/components/webLayout.constants';
import { SettingsHubMobile } from './SettingsHubMobile';
import { SettingsShell } from './SettingsShell';

/**
 * `/settings` on the web: the two-pane shell with **nothing selected** at
 * desktop width, today's hub with all 20 rows below it.
 *
 * Nothing is auto-selected. The shell's right pane shows what belongs to
 * settings as a whole — the profile card and logout — so the URL never claims
 * a selection the user did not make and the landing pane is still real
 * content.
 */
export function SettingsIndexView() {
  return useIsDesktopWeb() ? <SettingsShell /> : <SettingsHubMobile />;
}
