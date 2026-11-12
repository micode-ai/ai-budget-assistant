import { forwardRef, useImperativeHandle, useRef } from 'react';
import { ShareImageCard, type ShareImageCardHandle } from '@/components/share/ShareImageCard';
import type { ChildSharePayload } from '@/features/children/childShare';

export interface ChildShareCardHandle {
  /** Resolves false on any failure, on a timeout and always on web — the caller falls back. */
  share: (payload: ChildSharePayload) => Promise<boolean>;
}

/**
 * Thin wrapper over `ShareImageCard` (the ABA-353 rule: a new shareable card
 * wraps the mechanism, never copies it) — owns only the gradient, the file
 * prefix and the payload shape. The file tag is the date, never the child's
 * name. `ShareImageCard.web.tsx` is already a no-op, so no own `.web.tsx`.
 */
export const ChildShareCard = forwardRef<ChildShareCardHandle>(function ChildShareCard(_props, ref) {
  const inner = useRef<ShareImageCardHandle>(null);
  useImperativeHandle(ref, () => ({
    share: (p) =>
      inner.current?.share({ fileTag: new Date().toISOString().slice(0, 10), ...p }) ?? Promise.resolve(false),
  }));
  return (
    <ShareImageCard
      ref={inner}
      renderFnName="__renderChildCosts"
      gradientFrom="#F59E0B"
      gradientTo="#EC4899"
      fileNamePrefix="child-costs"
    />
  );
});
