import type { OAuthApproveBody, OAuthAuthorizeParams } from '@/services/oauth.api';

/**
 * The OAuth request parameters the consent route forwards to the server. Anything else in the
 * query string is dropped: the page has no use for it, and it must never become part of a URL we
 * build (the only URL this flow ever navigates to is the server's `redirectTo`).
 */
export const CONSENT_PARAM_KEYS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  // RFC 8707: an MCP client names the resource it wants a token for. Forwarded byte-for-byte to
  // preview and approve (and through the sign-in stash); never invented, defaulted or normalized
  // here — the server is the only one that decides what a value means (`invalid_target`).
  'resource',
] as const satisfies readonly (keyof OAuthAuthorizeParams)[];

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Picks the known keys from expo-router's search params; an array (a repeated key) keeps its first value. */
export function pickConsentParams(raw: RawSearchParams | null | undefined): OAuthAuthorizeParams {
  const out: OAuthAuthorizeParams = {};
  if (!raw) return out;
  for (const key of CONSENT_PARAM_KEYS) {
    const value = raw[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string') out[key] = first;
  }
  return out;
}

/** The in-app path of the consent route for these params — used to come back after sign-in. */
export function buildAuthorizePath(params: OAuthAuthorizeParams): string {
  const qs = new URLSearchParams();
  for (const key of CONSENT_PARAM_KEYS) {
    const value = params[key];
    if (typeof value === 'string') qs.append(key, value);
  }
  const s = qs.toString();
  return s ? `/authorize?${s}` : '/authorize';
}

/**
 * The approve request for these params. The OAuth fields go back exactly as the third party sent
 * them (`resource` only when it was there: absent must stay absent, the public API); accounts only
 * on allow.
 */
export function buildApproveBody(
  p: OAuthAuthorizeParams,
  decision: 'allow' | 'deny',
  accountIds: string[],
): OAuthApproveBody {
  return {
    client_id: p.client_id,
    redirect_uri: p.redirect_uri,
    scope: p.scope,
    state: p.state,
    code_challenge: p.code_challenge,
    code_challenge_method: p.code_challenge_method,
    ...(typeof p.resource === 'string' ? { resource: p.resource } : {}),
    ...(decision === 'allow' ? { account_ids: accountIds } : {}),
    decision,
  };
}

/** Stable identity of a param set, for effect dependencies (expo-router hands out a new object per render). */
export function consentParamsKey(params: OAuthAuthorizeParams): string {
  return buildAuthorizePath(params);
}

/** `secureStorage` key holding a consent request received while signed out. */
export const PENDING_CONSENT_KEY = 'pendingOAuthConsent';

/**
 * How long a stashed consent request survives. A person who abandoned sign-in and comes back
 * hours later must not be greeted by a stranger's consent screen; half an hour covers registering,
 * verifying an e-mail and a password reset.
 */
export const PENDING_CONSENT_TTL_MS = 30 * 60 * 1000;

export function serializePendingConsent(params: OAuthAuthorizeParams, now: number): string {
  return JSON.stringify({ params: pickConsentParams(params as RawSearchParams), savedAt: now });
}

export type PendingConsentOutcome =
  | { status: 'none' }
  | { status: 'discard' }
  | { status: 'resume'; path: string };

/** What a stashed value means. Junk and expired records are `discard`: the caller clears them. */
export function resolvePendingConsent(raw: string | null, now: number): PendingConsentOutcome {
  if (!raw) return { status: 'none' };
  try {
    const parsed = JSON.parse(raw) as { params?: unknown; savedAt?: unknown };
    if (typeof parsed.savedAt !== 'number' || !parsed.params || typeof parsed.params !== 'object') {
      return { status: 'discard' };
    }
    const age = now - parsed.savedAt;
    if (age < 0 || age > PENDING_CONSENT_TTL_MS) return { status: 'discard' };
    const params = pickConsentParams(parsed.params as RawSearchParams);
    if (!params.client_id) return { status: 'discard' };
    return { status: 'resume', path: buildAuthorizePath(params) };
  } catch {
    return { status: 'discard' };
  }
}
