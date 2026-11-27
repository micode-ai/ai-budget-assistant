import React from 'react';
import { useSupportThread } from '@/features/support/useSupportThread';
import { SupportMobile } from './SupportMobile';

/**
 * Native: there is no desktop on a phone, so this is the mobile view and
 * nothing else. The web counterpart is `SupportView.web.tsx`.
 *
 * The hook is called HERE and passed down as one `support` prop — never inside
 * `SupportMobile`/`SupportDesktop` (see `useSupportThread`).
 */
export function SupportView({ fromRoute }: { fromRoute?: string }) {
  const support = useSupportThread(fromRoute);
  return <SupportMobile support={support} fromRoute={fromRoute} />;
}
