import { useIsDesktopWeb } from '../webLayout.constants';
import { DashboardMobile } from './DashboardMobile';
import { DashboardDesktop } from './desktop/DashboardDesktop';

/**
 * The one place that decides, and it decides on width alone — same rule
 * `AnalyticsView.web.tsx`/`BudgetsView.web.tsx`/`ExpensesView.web.tsx` follow.
 */
export function DashboardView() {
  return useIsDesktopWeb() ? <DashboardDesktop /> : <DashboardMobile />;
}
