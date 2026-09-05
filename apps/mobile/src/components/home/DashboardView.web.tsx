import { useIsDesktopWeb } from '../webLayout.constants';
import { DashboardMobile } from './DashboardMobile';

/**
 * The one place that decides, and it decides on width alone — same rule
 * `AnalyticsView.web.tsx`/`BudgetsView.web.tsx`/`ExpensesView.web.tsx` follow.
 *
 * Unlike those three, both branches resolve to `DashboardMobile` for now.
 * The real desktop layout (`DashboardDesktop`) arrives in a later task of
 * this same plan; until then, returning `null` (or nothing at all) for
 * desktop would blank the landing screen in every desktop browser — worse
 * here than on any previous screen, since the dashboard is what a user sees
 * immediately after signing in. The gate itself is wired now so the desktop
 * branch only needs to be swapped in later, not added.
 */
export function DashboardView() {
  return useIsDesktopWeb() ? <DashboardMobile /> : <DashboardMobile />;
}
