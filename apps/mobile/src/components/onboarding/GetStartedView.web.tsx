import { useIsDesktopWeb } from '../webLayout.constants';
import { GetStartedMobile } from './GetStartedMobile';
import { GetStartedDesktop } from './desktop/GetStartedDesktop';

/**
 * The one place that decides, and it decides on width alone — same rule
 * `DashboardView.web.tsx`/`ChatView.web.tsx`/`ExpensesView.web.tsx` follow.
 *
 * There is no layout difference between the two branches: `GetStartedDesktop`
 * renders the identical `GetStartedMobile` JSX, only wiring which entries open
 * a dialog instead of navigating away (`dashboardDialogs.ts`'s table).
 */
export function GetStartedView() {
  return useIsDesktopWeb() ? <GetStartedDesktop /> : <GetStartedMobile />;
}
