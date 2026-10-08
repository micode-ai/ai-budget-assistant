import type { AuthSummary } from './policy';

const SENDER = 'forwarding-noreply@google.com';
// EN "confirmation code: 123456", PL "kod potwierdzenia: 123456", plus RU/UK/DE/ES/FR variants.
const BODY_CODE =
  /(?:confirmation code|kod potwierdzenia|код подтверждения|код підтвердження|best[aä]tigungscode|c[oó]digo de confirmaci[oó]n|code de confirmation)\s*[:：]?\s*(\d{6,12})/i;
const SUBJECT_CODE = /\(#(\d{6,12})\)/;

/**
 * Gmail's forwarding-verification mail: From forwarding-noreply@google.com AND a DKIM pass
 * for d=google.com. A spoofed From without Google's signature is NOT treated as verification
 * (it would let anyone plant a code in a victim's app).
 */
/**
 * The sender identity behind a verification mail, bound to the DKIM result:
 *  - mailauth saw exactly ONE From address and it is the one we parsed (two From headers
 *    make "which From does the signature cover" ambiguous: refused);
 *  - a DKIM pass for d=google.com (or a subdomain) that mailauth reports as aligned with
 *    that From domain.
 */
export function isGoogleSignedSender(fromAddress: string, auth: AuthSummary): boolean {
  const from = fromAddress.toLowerCase();
  if (from !== SENDER) return false;
  if (!auth.headerFrom || auth.headerFrom.length !== 1 || auth.headerFrom[0].toLowerCase() !== from) return false;
  return auth.dkim.some(
    (d) =>
      d.result === 'pass' &&
      d.aligned === true &&
      (d.domain === 'google.com' || d.domain.endsWith('.google.com')),
  );
}

export function extractGmailVerificationCode(
  fromAddress: string,
  auth: AuthSummary,
  subject: string | null,
  bodyText: string | null,
): string | null {
  if (!isGoogleSignedSender(fromAddress, auth)) return null;
  const fromBody = bodyText ? BODY_CODE.exec(bodyText) : null;
  if (fromBody) return fromBody[1];
  const fromSubject = subject ? SUBJECT_CODE.exec(subject) : null;
  return fromSubject ? fromSubject[1] : null;
}
