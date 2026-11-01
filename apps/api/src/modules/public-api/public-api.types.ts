import type { AuthenticatedRequest } from '../../common/types';
import type { PublicScope } from '../oauth/oauth-scopes';

/** What `PublicApiAuthGuard` adds on top of the app's usual request shape. */
export interface PublicApiOAuthContext {
  /** `OAuthClient.id` (the db id grants reference — never the public `client_id`). */
  clientDbId: string;
  clientName: string;
  grantId: string;
  /** The grant's current scopes (Ruling 10). */
  scopes: PublicScope[];
  /** 0 or 1 here; tier >= 2 accounts are refused by the guard. Tier 1 = read-only, text fields null. */
  encryptionTier: number;
}

export interface PublicApiRequest extends AuthenticatedRequest {
  oauth: PublicApiOAuthContext;
}
