import type { Acquisition } from './attribution.types';

export type { Acquisition } from './attribution.types';

/**
 * Native no-op.
 *
 * A native install has no landing-page query string to read: the user came from a store
 * listing, not from a tagged link. Attributing an install to the marketing site needs the
 * Play Install Referrer API, which is a separate piece of work — pretending otherwise here
 * would invent attribution that does not exist.
 */
export function captureAcquisition(): void {}

export function getAcquisition(): Acquisition | undefined {
  return undefined;
}

/**
 * Native no-op, for the same reason as `captureAcquisition`: an install carries
 * no query string. A referral code reaches a native signup only by the user
 * typing the code printed in the share message.
 */
export function captureReferralCode(): void {}

export function getReferralCode(): string | undefined {
  return undefined;
}
