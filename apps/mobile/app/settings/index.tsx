import React from 'react';
import { SettingsIndexView } from '@/components/settings/SettingsIndexView';

/**
 * The route stays single — every platform split in this repo is
 * component-level, and one route file keeps `app/_layout.tsx`'s registration
 * untouched. `SettingsIndexView` is the one file that decides mobile vs
 * desktop, on width alone.
 */
export default function SettingsIndexScreen() {
  return <SettingsIndexView />;
}
