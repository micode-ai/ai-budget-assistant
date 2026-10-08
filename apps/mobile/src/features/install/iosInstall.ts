/**
 * iOS "Add to Home Screen" helpers (ABA-645 phase 1). Pure: every input is passed in, so the rules are
 * testable without a browser.
 *
 * There is no native iOS app, so the installed web app (the PWA, docs/wiki/features/web-build-and-hosting.md)
 * is the only app-shaped AI Budget on an iPhone, and iOS has no install prompt of its own — the user must find
 * Share → "Add to Home Screen". The dashboard card explains that, and stays out of the way:
 *   - only on an iOS device (iPadOS reports itself as a Mac with touch),
 *   - never when the app already runs standalone (it is installed),
 *   - never again for REPROMPT_DAYS after a dismissal.
 * In-app browsers (Instagram, Facebook, TikTok…) cannot add to the home screen at all, so they get a
 * different message: open the page in Safari first.
 */

export const REPROMPT_DAYS = 14;
export const DISMISS_KEY = 'ios-install-dismissed-at';
export const SESSION_COMPLETED_KEY = 'ios-install-standalone-reported';

export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // iPadOS 13+ asks for the desktop site and reports MacIntel; only a touch screen tells it apart
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

/** Social-app webviews, which have no "Add to Home Screen" in their share menu. */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Twitter|LinkedInApp|GSA\//.test(userAgent);
}

/** `navigatorStandalone` is iOS Safari's own `navigator.standalone`; `displayModeStandalone` the
 *  `(display-mode: standalone)` media query (the standard, which newer iOS also answers). */
export function isStandalone(navigatorStandalone: unknown, displayModeStandalone: boolean): boolean {
  return navigatorStandalone === true || displayModeStandalone;
}

/** `dismissedAt` is the stored epoch ms of the last dismissal, or null when never dismissed / unreadable. */
export function shouldShowIosPrompt(opts: {
  ios: boolean;
  standalone: boolean;
  dismissedAt: number | null;
  now: number;
}): boolean {
  if (!opts.ios || opts.standalone) return false;
  if (opts.dismissedAt == null || !Number.isFinite(opts.dismissedAt)) return true;
  return opts.now - opts.dismissedAt >= REPROMPT_DAYS * 24 * 60 * 60 * 1000;
}
