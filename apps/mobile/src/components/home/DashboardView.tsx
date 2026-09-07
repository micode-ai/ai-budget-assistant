import { DashboardMobile } from './DashboardMobile';

/**
 * Native. There is no desktop on a phone, so this is the mobile view and
 * nothing else. The web counterpart is `DashboardView.web.tsx`; Metro
 * resolves the platform file at bundle time, so no desktop code reaches the
 * native app.
 */
export function DashboardView() {
  return <DashboardMobile />;
}
