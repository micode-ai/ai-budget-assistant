import { forwardRef, useImperativeHandle, useRef } from 'react';
import { ShareImageCard, type ShareImageCardHandle } from '@/components/share/ShareImageCard';
import type { ShareLine } from '@/features/insights/realSalary';

export interface RealSalarySharePayload {
  title: string;
  lines: ShareLine[];
  footer: string;
}

export interface RealSalaryShareCardHandle {
  /** Resolves false on any failure (and always on web) — the caller falls back to a text share. */
  share: (payload: RealSalarySharePayload) => Promise<boolean>;
}

/**
 * Thin wrapper over the generic `ShareImageCard` webview/canvas/share mechanism
 * (ABA-353 rule: a new shareable card wraps it rather than re-implementing the
 * bridge) — owns only the real-salary gradient, file-name prefix, and payload
 * shape. `ShareImageCard.web.tsx` is already a no-op, so no own `.web.tsx` is
 * needed here.
 */
export const RealSalaryShareCard = forwardRef<RealSalaryShareCardHandle>(function RealSalaryShareCard(_props, ref) {
  const inner = useRef<ShareImageCardHandle>(null);
  useImperativeHandle(ref, () => ({
    share: (p) =>
      inner.current?.share({ fileTag: new Date().toISOString().slice(0, 10), ...p }) ?? Promise.resolve(false),
  }));
  return (
    <ShareImageCard
      ref={inner}
      renderFnName="__renderRealSalary"
      gradientFrom="#0EA5E9"
      gradientTo="#6366F1"
      fileNamePrefix="real-salary"
    />
  );
});
