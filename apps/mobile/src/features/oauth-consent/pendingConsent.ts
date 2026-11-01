import { secureStorage } from '@/services/secureStorage';
import type { OAuthAuthorizeParams } from '@/services/oauth.api';
import {
  PENDING_CONSENT_KEY,
  resolvePendingConsent,
  serializePendingConsent,
} from './consentParams';

/**
 * Holds a consent request across sign-in — the same stash-and-flush shape as `pendingGroupLink`.
 * The consent route stashes it and sends a signed-out visitor to the login screen; whichever way
 * they then get in (password, Google, a passkey, a fresh registration), `useOAuthConsentResume`
 * reopens the consent route with the full original query once the app is ready.
 */
export async function stashPendingConsent(params: OAuthAuthorizeParams): Promise<void> {
  await secureStorage.setItem(PENDING_CONSENT_KEY, serializePendingConsent(params, Date.now()));
}

/** Reads and clears the stash. Returns the `/authorize?…` path to reopen, or null. */
export async function takePendingConsent(): Promise<string | null> {
  const outcome = resolvePendingConsent(await secureStorage.getItem(PENDING_CONSENT_KEY), Date.now());
  if (outcome.status === 'none') return null;
  await secureStorage.removeItem(PENDING_CONSENT_KEY);
  return outcome.status === 'resume' ? outcome.path : null;
}
