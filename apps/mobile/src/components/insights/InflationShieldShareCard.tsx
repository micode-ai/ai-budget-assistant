import { forwardRef, useImperativeHandle, useRef } from 'react';
import { ShareImageCard, type ShareImageCardHandle } from '@/components/share/ShareImageCard';
import type { ShieldSharePayload } from '@/features/insights/shieldShare';

export interface InflationShieldShareCardHandle {
  /** Renders the payload to a PNG story card and opens the native share sheet. Resolves false on any failure. */
  share: (payload: ShieldSharePayload) => Promise<boolean>;
}

/**
 * Thin wrapper over the generic `ShareImageCard` webview/canvas/share mechanism —
 * owns only the Shield-specific gradient and file-name prefix (`ShieldSharePayload`
 * already matches the generic `fileTag`/`title`/`lines`/`footer` shape).
 */
export const InflationShieldShareCard = forwardRef<InflationShieldShareCardHandle>(function InflationShieldShareCard(_props, ref) {
  const innerRef = useRef<ShareImageCardHandle>(null);

  useImperativeHandle(ref, () => ({
    share: (payload: ShieldSharePayload) => innerRef.current?.share(payload) ?? Promise.resolve(false),
  }));

  return (
    <ShareImageCard
      ref={innerRef}
      renderFnName="__renderShield"
      gradientFrom="#065F46"
      gradientTo="#10B981"
      fileNamePrefix="inflation-shield"
    />
  );
});
