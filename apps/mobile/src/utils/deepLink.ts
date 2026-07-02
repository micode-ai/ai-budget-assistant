/**
 * Extracts an 8-character hex trip-invite code from a universal link like
 * https://ai-budget.pl/trip-invite/<code>. Matches AccountsService's
 * `randomBytes(4).toString('hex')` invite-code format (8 hex chars).
 */
export function extractTripInviteCode(url: string): string | null {
  const match = url.match(/trip-invite\/([a-f0-9]{8})/i);
  return match ? match[1] : null;
}
