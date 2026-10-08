import { isIosDevice, isInAppBrowser, isStandalone, shouldShowIosPrompt, REPROMPT_DAYS } from '../iosInstall';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const INSTAGRAM = IPHONE + ' Instagram 300.0.0.0';
const DAY = 24 * 60 * 60 * 1000;

describe('isIosDevice', () => {
  it('detects an iPhone', () => expect(isIosDevice(IPHONE, 'iPhone', 5)).toBe(true));
  it('detects iPadOS posing as a Mac with touch', () => expect(isIosDevice(MAC, 'MacIntel', 5)).toBe(true));
  it('does not treat a real Mac as iOS', () => expect(isIosDevice(MAC, 'MacIntel', 0)).toBe(false));
  it('does not treat Android as iOS', () => expect(isIosDevice(ANDROID, 'Linux armv8l', 5)).toBe(false));
});

describe('isInAppBrowser', () => {
  it('flags the Instagram webview', () => expect(isInAppBrowser(INSTAGRAM)).toBe(true));
  it('does not flag Safari', () => expect(isInAppBrowser(IPHONE)).toBe(false));
});

describe('isStandalone', () => {
  it('trusts navigator.standalone === true', () => expect(isStandalone(true, false)).toBe(true));
  it('trusts the display-mode media query', () => expect(isStandalone(undefined, true)).toBe(true));
  it('is false in a normal tab', () => expect(isStandalone(false, false)).toBe(false));
  it('does not treat a truthy non-boolean as standalone', () => expect(isStandalone('yes', false)).toBe(false));
});

describe('shouldShowIosPrompt', () => {
  const now = 1_800_000_000_000;
  it('shows on iOS when never dismissed', () => expect(shouldShowIosPrompt({ ios: true, standalone: false, dismissedAt: null, now })).toBe(true));
  it('never shows off iOS', () => expect(shouldShowIosPrompt({ ios: false, standalone: false, dismissedAt: null, now })).toBe(false));
  it('never shows when already installed', () => expect(shouldShowIosPrompt({ ios: true, standalone: true, dismissedAt: null, now })).toBe(false));
  it('stays hidden inside the reprompt window', () => expect(shouldShowIosPrompt({ ios: true, standalone: false, dismissedAt: now - (REPROMPT_DAYS - 1) * DAY, now })).toBe(false));
  it('comes back after the reprompt window', () => expect(shouldShowIosPrompt({ ios: true, standalone: false, dismissedAt: now - REPROMPT_DAYS * DAY, now })).toBe(true));
  it('treats an unreadable stored value as never dismissed', () => expect(shouldShowIosPrompt({ ios: true, standalone: false, dismissedAt: NaN, now })).toBe(true));
});
