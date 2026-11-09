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

export function signUnsubscribeToken(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(PURPOSE + userId).digest('base64url');
}

export function verifyUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  if (!userId || !token || !secret) return false;
  const expected = Buffer.from(signUnsubscribeToken(userId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Absolute URL of the public unsubscribe endpoint for this user. */
export function buildUnsubscribeUrl(baseUrl: string, userId: string, secret: string): string {
  const qs = new URLSearchParams({ u: userId, t: signUnsubscribeToken(userId, secret) });
  return `${baseUrl.replace(/\/+$/, '')}/api/v1/mail/unsubscribe?${qs.toString()}`;
}
