import type { AccountType } from '@budget/shared-types';
import { httpClient } from './http-client';

/**
 * Settings → Developers and Settings → Connected apps (Public API phase 1).
 *
 * These shapes mirror `apps/api/src/modules/oauth/oauth-clients.service.ts` (`DeveloperAppView`)
 * and `oauth-grants.service.ts` (`listConnectedApps`). They are not in `@budget/shared-types` yet,
 * so they live here beside `oauth.api.ts`'s consent shapes until both move there (handoff in the
 * Task 13 and Task 14 reports). Timestamps arrive as ISO strings over JSON.
 *
 * With `PUBLIC_API_ENABLED` off every route here answers 404, which is how the app learns the
 * feature is off (`features/developers/developerApps.ts` → `isPublicApiUnavailable`).
 *
 * Neither family is account-scoped: developer apps belong to the user, and connected apps span
 * every account where the user is owner/editor (the server filters). The `X-Account-Id` header
 * the client adds is ignored by both controllers.
 */

export type DeveloperAppStatus = 'active' | 'blocked';

export interface DeveloperApp {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  homepageUrl: string;
  privacyPolicyUrl: string | null;
  redirectUris: string[];
  isConfidential: boolean;
  status: DeveloperAppStatus;
  blockedReason: string | null;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present on the list route only. */
  connectedUsers?: number;
  /** Present on the list route only. */
  lastUsedAt?: string | null;
}

export interface DeveloperAppInput {
  name: string;
  description?: string;
  logoUrl?: string;
  homepageUrl: string;
  privacyPolicyUrl?: string;
  redirectUris: string[];
  /** Create only — a client cannot change type after registration. Default true on the server. */
  isConfidential?: boolean;
}

/**
 * `null` clears an optional field: the server's `@IsOptional()` skips validation for null and the
 * update writes it as-is. Never send null for `name`/`homepageUrl`/`redirectUris` (required columns).
 */
export interface DeveloperAppUpdate {
  name?: string;
  description?: string | null;
  logoUrl?: string | null;
  homepageUrl?: string;
  privacyPolicyUrl?: string | null;
  redirectUris?: string[];
}

export interface ConnectedApp {
  grantId: string;
  app: {
    name: string;
    logoUrl: string | null;
    /** Null for an assistant-registered app (R11): never shown as a link. */
    homepageUrl: string | null;
    isVerified: boolean;
    status: DeveloperAppStatus;
    /** Registered automatically by an AI assistant (dynamic client registration). Absent = false. */
    registeredByAssistant?: boolean;
  };
  /** True for the user who connected the app; a co-owner sees only their own accounts of it. */
  isGrantor: boolean;
  accounts: {
    id: string;
    /** null when the grantor is no longer a member of the account. */
    name: string | null;
    type: AccountType;
    active: boolean;
    reason: 'role' | 'encrypted' | 'archived' | null;
  }[];
  scopes: string[];
  connectedBy: { id: string; name: string };
  connectedAt: string;
  lastUsedAt: string | null;
}

export const developerAppsApi = {
  listDeveloperApps() {
    return httpClient.request<{ apps: DeveloperApp[] }>('/developer/apps');
  },

  /** `clientSecret` is present for a confidential client only, and only in this one response. */
  createDeveloperApp(input: DeveloperAppInput) {
    return httpClient.request<{ app: DeveloperApp; clientSecret?: string }>('/developer/apps', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateDeveloperApp(id: string, input: DeveloperAppUpdate) {
    return httpClient.request<{ app: DeveloperApp }>(`/developer/apps/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  /** The previous secret stops working immediately. */
  rotateDeveloperAppSecret(id: string) {
    return httpClient.request<{ clientSecret: string }>(
      `/developer/apps/${encodeURIComponent(id)}/rotate-secret`,
      { method: 'POST' },
    );
  },

  deleteDeveloperApp(id: string) {
    return httpClient.request<void>(`/developer/apps/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  listConnectedApps() {
    return httpClient.request<ConnectedApp[]>('/connected-apps');
  },

  disconnectConnectedApp(grantId: string) {
    return httpClient.request<void>(`/connected-apps/${encodeURIComponent(grantId)}`, { method: 'DELETE' });
  },

  removeConnectedAppAccount(grantId: string, accountId: string) {
    return httpClient.request<void>(
      `/connected-apps/${encodeURIComponent(grantId)}/accounts/${encodeURIComponent(accountId)}`,
      { method: 'DELETE' },
    );
  },
};
