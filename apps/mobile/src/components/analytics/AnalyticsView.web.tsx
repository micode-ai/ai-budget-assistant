import { useIsDesktopWeb } from '../webLayout.constants';
import { AnalyticsMobile } from './AnalyticsMobile';

/**
 * The one place that decides, and it decides on width alone — same rule
 * `ExpensesView.web.tsx` follows. The desktop component (`AnalyticsDesktop`)
 * hasn't landed yet (a later task in this plan); until it does, the
 * desktop-width branch also renders `AnalyticsMobile` rather than a stub
 * returning null, which would leave the Analytics tab blank in every desktop
 * browser in the meantime. The gate itself is wired now so swapping in the
 * real desktop component later is a one-line change.
 */
export function AnalyticsView() {
  return useIsDesktopWeb() ? <AnalyticsMobile /> : <AnalyticsMobile />;
}
