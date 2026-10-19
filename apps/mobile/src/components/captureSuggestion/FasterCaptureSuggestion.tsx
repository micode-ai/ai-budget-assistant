import { FasterCaptureSheet } from './FasterCaptureSheet';

/**
 * The one-time "faster ways to add expenses" suggestion (ABA-682), mounted
 * unconditionally in `app/_layout.tsx` beside the What's New spotlight. It
 * renders nothing until a manual save makes it due.
 *
 * Native always gets the bottom sheet; `FasterCaptureSuggestion.web.tsx`
 * decides by width so the desktop dialog never enters the native bundle.
 */
export function FasterCaptureSuggestion() {
  return <FasterCaptureSheet />;
}
