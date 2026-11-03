import type { AccountRole, AccountType } from '@budget/shared-types';
import { httpClient } from './http-client';

/**
 * Backend of the OAuth consent page (`app.ai-budget.pl/authorize`, Public API phase 1).
 *
 * These shapes mirror `apps/api/src/modules/oauth/oauth-authorize.service.ts`
 * (`AuthorizePreview`, `AuthorizePreviewAccount`); they are not in `@budget/shared-types` yet, so
 * they live here until they move there (handoff in the Task 13 report). With `PUBLIC_API_ENABLED`
 * off every route answers 404.
 *
 * Errors are RFC 6749 bodies (`{ error, error_description }`), not the app's usual `{ message, code }`,
 * so callers read the code from the thrown error's `body` (`features/oauth-consent/consentErrors.ts`).
 */

/** The phase-1 scopes. The server rejects any other value, so the UI never sees one. */
export type OAuthScope =
  | 'expenses:read'
  | 'expenses:write'
  | 'receipts:read'
  | 'categories:read'
  | 'incomes:read'
  | 'incomes:write'
  | 'budgets:read'
  | 'budgets:write'
  | 'analytics:read';

export interface OAuthConsentApp {
  name: string;
  logoUrl: string | null;
  homepageUrl: string;
  privacyPolicyUrl: string | null;
  isVerified: boolean;
  developerName: string | null;
}

export interface OAuthConsentAccount {
  id: string;
  name: string;
  type: AccountType;
  role: AccountRole;
  selectable: boolean;
  reason: 'viewer' | 'encrypted' | null;
  /** `encryptionTier === 1`: the app may read, encrypted text comes back hidden, writes are refused. */
  readOnly: boolean;
  /** The app is already connected to this account (re-consent pre-ticks it). */
  connected: boolean;
}

export interface OAuthAuthorizePreview {
  app: OAuthConsentApp;
  scopes: OAuthScope[];
  accounts: OAuthConsentAccount[];
}

/** The OAuth request exactly as the third party sent it in the consent URL's query string. */
export interface OAuthAuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

export interface OAuthApproveBody {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  /** Accounts the app may use; the server replaces the connection's set with exactly these. */
  account_ids?: string[];
  decision: 'allow' | 'deny';
}

function toQuery(params: OAuthAuthorizeParams): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.append(key, value);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const oauthApi = {
  preview(params: OAuthAuthorizeParams) {
    return httpClient.request<OAuthAuthorizePreview>(`/oauth/authorize/preview${toQuery(params)}`);
  },

  approve(body: OAuthApproveBody) {
    return httpClient.request<{ redirectTo: string }>('/oauth/authorize/approve', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
