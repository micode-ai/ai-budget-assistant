import { GetStartedMobile } from './GetStartedMobile';

/**
 * Native. There is no desktop on a phone, so this is the mobile view and
 * nothing else. The web counterpart is `GetStartedView.web.tsx`; Metro
 * resolves the platform file at bundle time, so no desktop code (the dialogs
 * under `src/components/**\/desktop/`) ever reaches the native bundle.
 */
export function GetStartedView() {
  return <GetStartedMobile />;
}
