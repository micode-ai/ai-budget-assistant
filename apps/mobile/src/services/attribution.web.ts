import {
  ACQUISITION_KEYS,
  parseAcquisition,
  parseReferralCode,
  type Acquisition,
} from './attribution.types';

export type { Acquisition } from './attribution.types';

const KEY = 'acquisition';
const REFERRAL_KEY = 'referralCode';

/**
 * Browser acquisition capture.
 *
 * The landing/blog/help CTAs arrive here as `?src=landing&loc=hero&lang=en`, but the
 * registration that the click leads to can happen much later — after the email
 * verification round trip, or after being bounced out to Google and back. So the params
 * are read on FIRST arrival and parked in localStorage until a signup actually happens.
 *
 * First touch wins: an existing record is never overwritten. A visitor who lands from a
 * blog article, leaves, and comes back a week later through the pricing page is still
 * credited to the article that first brought them. That also means these values describe
 * where a visit STARTED and are not cross-session attribution.
 *
 * Every access is wrapped: localStorage throws outright in some privacy modes, and a
 * dead analytics field must not take the auth screen down with it.
 */
export function captureAcquisition(): void {
  try {
    const found = parseAcquisition(window.location.search);
    if (!found) return;
    if (window.localStorage.getItem(KEY)) return; // first touch wins
    window.localStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    /* private mode, storage disabled, no window — attribution is optional by design */
  }
}

export function getAcquisition(): Acquisition | undefined {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Acquisition;
    // Re-check on read: the value is round-tripped through storage a user can edit.
    const clean: Acquisition = {};
    let found = false;
    for (const k of ACQUISITION_KEYS) {
      const v = parsed?.[k];
      if (typeof v === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(v)) {
        clean[k] = v;
        found = true;
      }
    }
    return found ? clean : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Capture a referral code arriving as `?ref=` on a shared link.
 *
 * Kept beside acquisition capture rather than in its own module because it has
 * the same one hard requirement: it must read the query string on FIRST load,
 * before expo-router takes over the URL. Both are therefore called from the
 * real entry point, and one call site is easier to keep correct than two.
 *
 * Stored separately from `Acquisition` on purpose — a referral code is not an
 * acquisition column, it is an argument to registration, and mixing it in would
 * put it on a path towards `acquisition*` DB fields where it does not belong.
 *
 * First touch wins, matching acquisition: if a visitor arrives on one friend's
 * link and later on another's, the first friend keeps the credit.
 */
export function captureReferralCode(): void {
  try {
    const found = parseReferralCode(window.location.search);
    if (!found) return;
    if (window.localStorage.getItem(REFERRAL_KEY)) return;
    window.localStorage.setItem(REFERRAL_KEY, found);
  } catch {
    /* private mode, storage disabled, no window - a referral must never break signup */
  }
}

export function getReferralCode(): string | undefined {
  try {
    const raw = window.localStorage.getItem(REFERRAL_KEY);
    // Re-checked on read: the value round-trips through storage a user can edit.
    return raw && /^[A-Z0-9]{4,12}$/.test(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}
