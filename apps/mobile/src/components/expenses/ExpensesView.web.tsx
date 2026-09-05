import { useIsDesktopWeb } from '../webLayout.constants';
import { ExpensesMobile } from './ExpensesMobile';
import { ExpensesDesktop } from './desktop/ExpensesDesktop';

/**
 * The one place that decides, and it decides on width alone. Below
 * DESKTOP_MIN_WIDTH (1024) a browser gets the mobile view byte-for-byte — the
 * same rule `WebShell` already follows, so a phone browser is unaffected by
 * everything in `desktop/`.
 */
export function ExpensesView() {
  return useIsDesktopWeb() ? <ExpensesDesktop /> : <ExpensesMobile />;
}
