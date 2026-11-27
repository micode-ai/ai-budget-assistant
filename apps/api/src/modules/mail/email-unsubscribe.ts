import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed one-click unsubscribe links for the onboarding e-mail (ABA-738).
 *
 * The link must work without signing in — that is the point of an unsubscribe
 * link — so it carries the user id plus an HMAC over it. Without the HMAC anyone
 * could turn off anyone's e-mails by guessing an id. The `purpose` prefix scopes
 * a token to this list, so a token for one list can never unsubscribe another.
 */
const PURPOSE = 'unsubscribe:onboarding:';
/** The support-reply e-mail fallback list; a distinct prefix so the two token families never cross. */
const SUPPORT_PURPOSE = 'unsubscribe:support:';

function signFor(purpose: string, userId: string, secret: string): string {
  return createHmac('sha256', secret).update(purpose + userId).digest('base64url');
}

function verifyFor(purpose: string, userId: string, token: string, secret: string): boolean {
  if (!userId || !token || !secret) return false;
  const expected = Buffer.from(signFor(purpose, userId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function signUnsubscribeToken(userId: string, secret: string): string {
  return signFor(PURPOSE, userId, secret);
}

export function verifyUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  return verifyFor(PURPOSE, userId, token, secret);
}

export function signSupportUnsubscribeToken(userId: string, secret: string): string {
  return signFor(SUPPORT_PURPOSE, userId, secret);
}

export function verifySupportUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  return verifyFor(SUPPORT_PURPOSE, userId, token, secret);
}

/** Absolute URL of the public unsubscribe endpoint for this user. */
export function buildUnsubscribeUrl(baseUrl: string, userId: string, secret: string): string {
  const qs = new URLSearchParams({ u: userId, t: signUnsubscribeToken(userId, secret) });
  return `${baseUrl.replace(/\/+$/, '')}/api/v1/mail/unsubscribe?${qs.toString()}`;
}

/** Absolute URL of the public unsubscribe endpoint for the support-reply e-mails. */
export function buildSupportUnsubscribeUrl(baseUrl: string, userId: string, secret: string): string {
  const qs = new URLSearchParams({ u: userId, t: signSupportUnsubscribeToken(userId, secret) });
  return `${baseUrl.replace(/\/+$/, '')}/api/v1/mail/unsubscribe/support?${qs.toString()}`;
}
