import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SupportView } from '@/components/support/SupportView';
import { sanitizeFromRoute } from '@/features/support/openSupport';

/**
 * "Write to the developer". A thin route: the platform split is in
 * `SupportView` / `SupportView.web` (component-level, never route-level).
 * `from` is the route PATTERN of the screen it was opened from.
 */
export default function SupportScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return <SupportView fromRoute={sanitizeFromRoute(from)} />;
}
