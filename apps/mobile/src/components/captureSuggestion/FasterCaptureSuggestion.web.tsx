import { useIsDesktopWeb } from '@/components/webLayout.constants';
import { FasterCaptureSheet } from './FasterCaptureSheet';
import { FasterCaptureDialog } from './desktop/FasterCaptureDialog';

/**
 * Web decides by width: a centred dialog in the desktop shell (>= 1024px),
 * the phone sheet below it. Both read the same hook, so resizing across the
 * breakpoint while it is open swaps the frame, not the state.
 */
export function FasterCaptureSuggestion() {
  const isDesktop = useIsDesktopWeb();
  return isDesktop ? <FasterCaptureDialog /> : <FasterCaptureSheet />;
}
