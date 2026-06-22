import { Platform, useWindowDimensions } from 'react-native';

export const DESKTOP_MIN_WIDTH = 1024;
// Wide so that on a typical laptop the content column fills the space right of
// the sidebar — keeping the page scrollbar at the right edge (a "general" scroll)
// rather than floating mid-page. Centers with small side margins only on very
// wide monitors.
export const CONTENT_MAX_WIDTH = 1080;
export const SIDEBAR_WIDTH = 240;
// Height of the full-width desktop top bar (brand + global controls).
export const TOP_BAR_HEIGHT = 56;
export const COLUMN_HORIZONTAL_PADDING = 16;

/** Pure gate — true only on web at desktop width. Native never qualifies. */
export function isDesktopWeb(width: number): boolean {
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

/** Reactive hook form: re-evaluates on browser resize. */
export function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return isDesktopWeb(width);
}
