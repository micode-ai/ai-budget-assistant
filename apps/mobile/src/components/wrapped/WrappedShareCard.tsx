import { forwardRef, useImperativeHandle, useRef } from 'react';
import { ShareImageCard, type ShareImageCardHandle } from '@/components/share/ShareImageCard';

export interface WrappedShareLine {
  emoji: string;
  label: string;
  value: string;
}

export interface WrappedSharePayload {
  /** Used only to name the generated file (wrapped-<year>.png). */
  year: number | string;
  title: string;
  lines: WrappedShareLine[];
  footer: string;
}

export interface WrappedShareCardHandle {
  /** Renders the payload to a PNG story card and opens the native share sheet. Resolves false on any failure. */
  share: (payload: WrappedSharePayload) => Promise<boolean>;
}

/**
 * Thin wrapper over the generic `ShareImageCard` webview/canvas/share mechanism —
 * owns only the Wrapped-specific gradient, file-name prefix, and payload shape.
 */
export const WrappedShareCard = forwardRef<WrappedShareCardHandle>(function WrappedShareCard(_props, ref) {
  const innerRef = useRef<ShareImageCardHandle>(null);

  useImperativeHandle(ref, () => ({
    share: ({ year, ...rest }: WrappedSharePayload) =>
      innerRef.current?.share({ fileTag: year, ...rest }) ?? Promise.resolve(false),
  }));

  return (
    <ShareImageCard
      ref={innerRef}
      renderFnName="__renderWrapped"
      gradientFrom="#7C3AED"
      gradientTo="#DB2777"
      fileNamePrefix="wrapped"
    />
  );
});
