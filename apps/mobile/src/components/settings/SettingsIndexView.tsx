import React from 'react';
import { SettingsHubMobile } from './SettingsHubMobile';

/**
 * Native. `/settings` is the hub and nothing else; this file imports no
 * desktop code, so none reaches the native bundle. The web counterpart is
 * `SettingsIndexView.web.tsx`.
 */
export function SettingsIndexView() {
  return <SettingsHubMobile />;
}
