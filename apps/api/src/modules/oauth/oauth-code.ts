import type { PublicScope } from './oauth-scopes';

/** Authorization codes live 10 minutes and are single use (consumed with `CacheService.takeOnce`). */
export const OAUTH_CODE_TTL_SEC = 600;

/** Redis key of an authorization code — keyed by its SHA-256 hex, never the code itself. */
export function oauthCodeKey(codeHash: string): string {
  return `oauth:code:${codeHash}`;
}

/** What the approve step stores and the token endpoint (Task 5) consumes. */
export interface OAuthCodePayload {
  grantId: string;
  /** OAuthClient.id (the db id), NOT the public `client_id` — compare with the authenticated client's id. */
  clientDbId: string;
  /** Exactly as sent to approve; the token request must repeat it verbatim. */
  redirectUri: string;
  /** PKCE S256 challenge (base64url, 43 chars). */
  codeChallenge: string;
  scopes: PublicScope[];
}
