import { useIsDesktopWeb } from '../webLayout.constants';
import { BudgetsMobile } from './BudgetsMobile';

/**
 * The one place that decides, and it decides on width alone — same rule
 * `AnalyticsView.web.tsx`/`ExpensesView.web.tsx` follow. The desktop
 * component (`BudgetsDesktop`) hasn't landed yet (a later task in this
 * plan); until it does, the desktop-width branch also renders
 * `BudgetsMobile` rather than a stub returning null, which would leave the
 * Budgets tab blank in every desktop browser in the meantime. The gate
 * itself is wired now so swapping in the real desktop component later is a
 * one-line change.
 */
export function BudgetsView() {
  return useIsDesktopWeb() ? <BudgetsMobile /> : <BudgetsMobile />;
}
