import { useWindowDimensions } from 'react-native';
import {
  isDesktopWeb,
  CONTENT_MAX_WIDTH,
  COLUMN_HORIZONTAL_PADDING,
} from '@/components/webLayout.constants';

/** Width that measured content (charts, carousels) should size against. */
export function contentWidthFor(windowWidth: number): number {
  if (isDesktopWeb(windowWidth)) {
    return CONTENT_MAX_WIDTH - COLUMN_HORIZONTAL_PADDING * 2;
  }
  return windowWidth;
}

export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return contentWidthFor(width);
}
