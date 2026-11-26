import React from 'react';
import { usePrivacyStore } from '@/stores/privacyStore';

/**
 * Privacy mode formats amounts at render time through the shared `formatCurrency`,
 * so a flip must repaint every amount already on screen. Wrapping a tab's content
 * here remounts only that subtree (not the navigator, whose state lives above)
 * when the mask changes. Pushed screens are created after the flip and read the
 * current mask, so they need no wrapper.
 */
export function PrivacyBoundary({ children }: { children: React.ReactNode }) {
  const masked = usePrivacyStore((s) => s.privacyMode);
  return <React.Fragment key={masked ? 'masked' : 'revealed'}>{children}</React.Fragment>;
}
