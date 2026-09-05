import { useIsDesktopWeb } from '../webLayout.constants';
import { AnalyticsMobile } from './AnalyticsMobile';
import { AnalyticsDesktop } from './desktop/AnalyticsDesktop';

/**
 * The one place that decides, and it decides on width alone — same rule
 * `ExpensesView.web.tsx` follows. Below `DESKTOP_MIN_WIDTH` a browser gets the
 * mobile view byte-for-byte; at or above it, `AnalyticsDesktop` (ABA-501).
 */
export function AnalyticsView() {
  return useIsDesktopWeb() ? <AnalyticsDesktop /> : <AnalyticsMobile />;
}
