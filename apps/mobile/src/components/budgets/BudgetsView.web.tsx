import { useIsDesktopWeb } from '../webLayout.constants';
import { BudgetsMobile } from './BudgetsMobile';
import { BudgetsDesktop } from './desktop/BudgetsDesktop';

/**
 * The one place that decides, and it decides on width alone — same rule
 * `AnalyticsView.web.tsx`/`ExpensesView.web.tsx` follow. Native never
 * reaches this file at all (`BudgetsView.tsx` is its own sibling, imported
 * by Metro's platform resolution instead), so `BudgetsDesktop` never ships
 * to a phone.
 */
export function BudgetsView() {
  return useIsDesktopWeb() ? <BudgetsDesktop /> : <BudgetsMobile />;
}
