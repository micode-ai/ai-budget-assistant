import React from 'react';
import { useIsDesktopWeb } from '../webLayout.constants';
import { useSupportThread } from '@/features/support/useSupportThread';
import { SupportMobile } from './SupportMobile';
import { SupportDesktop } from './SupportDesktop';

/**
 * Decides on width alone: desktop at ≥1024, the phone layout below — the rule
 * `ChatView.web.tsx` follows.
 *
 * The hook is called HERE, once, so a browser resize across the breakpoint
 * (which swaps the child) keeps the half-typed draft and the loaded pages.
 */
export function SupportView({ fromRoute }: { fromRoute?: string }) {
  const support = useSupportThread(fromRoute);
  return useIsDesktopWeb() ? (
    <SupportDesktop support={support} fromRoute={fromRoute} />
  ) : (
    <SupportMobile support={support} fromRoute={fromRoute} />
  );
}
