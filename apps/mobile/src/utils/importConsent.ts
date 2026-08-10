/**
 * True when the current account already granted AI-import consent earlier in
 * this app session (see `importStore.aiConsentGrantedFor`) yet the server has
 * just answered `needs_ai_consent` again for the same account. That
 * combination means the grant did not "take" server-side — a race, or some
 * account state the client didn't anticipate — and re-presenting the consent
 * question would loop forever (the user taps "Use AI", the grant call
 * appears to succeed, the retried preview asks for consent again, repeat).
 *
 * Both ids must be non-null and equal: a `null` `aiConsentGrantedFor` just
 * means "never granted this session" and must never match a `null`
 * `currentAccountId` (no account selected yet) as if it were a loop.
 */
export function isAiConsentLoop(
  aiConsentGrantedFor: string | null,
  currentAccountId: string | null,
): boolean {
  return currentAccountId !== null && aiConsentGrantedFor === currentAccountId;
}
