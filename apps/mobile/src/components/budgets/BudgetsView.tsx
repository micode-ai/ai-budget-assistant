import { BudgetsMobile } from './BudgetsMobile';

/**
 * Native. There is no desktop on a phone, so this is the mobile view and
 * nothing else. The web counterpart is `BudgetsView.web.tsx`; Metro resolves
 * the platform file at bundle time, so no desktop code reaches the native
 * app.
 */
export function BudgetsView() {
  return <BudgetsMobile />;
}
