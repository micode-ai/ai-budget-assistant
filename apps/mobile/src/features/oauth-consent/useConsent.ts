import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { oauthApi } from '@/services/api';
import type { OAuthConsentAccount, OAuthConsentApp, OAuthScope } from '@/services/oauth.api';
import { httpStatusOf, oauthErrorCode } from './consentErrors';
import { initialAccountSelection } from './consentDisplay';
import { consentParamsKey, pickConsentParams, type RawSearchParams } from './consentParams';
import { stashPendingConsent } from './pendingConsent';
import { openRedirect } from './openRedirect';

/**
 * Why the page cannot go on, or why one Allow/Deny press failed. Each one is an
 * `oauthConsent.errors.<key>` string in all nine locales.
 */
export type ConsentErrorKey =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_redirect_uri'
  | 'invalid_scope'
  | 'unsupported_response_type'
  | 'access_denied'
  | 'account_encrypted'
  | 'temporarily_unavailable'
  | 'unavailable'
  | 'generic';

const REQUEST_ERRORS: readonly string[] = [
  'invalid_request',
  'invalid_client',
  'invalid_redirect_uri',
  'invalid_scope',
  'unsupported_response_type',
];

/**
 * `loading` → `ready` ⇄ `submitting` → `done`, or `error` from loading or from a request-level
 * failure on submit. `error` is terminal: the page never redirects from it, because the request it
 * would redirect to has not been proven.
 */
export type ConsentStatus = 'loading' | 'error' | 'ready' | 'submitting' | 'done';

export interface ConsentState {
  status: ConsentStatus;
  /** Why the page stopped (`status === 'error'`). */
  error?: ConsentErrorKey;
  /** Why the last Allow/Deny press failed while the page stays usable (`status === 'ready'`). */
  submitError?: ConsentErrorKey;
  /** Which button is in flight, for the spinner. */
  pendingDecision: 'allow' | 'deny' | null;
  app: OAuthConsentApp | null;
  scopes: OAuthScope[];
  accounts: OAuthConsentAccount[];
  selectedAccountIds: string[];
  toggle(id: string): void;
  /** Some account is already connected: this is a re-consent that replaces the set. */
  isReconsent: boolean;
  allow(): Promise<void>;
  deny(): Promise<void>;
}

/** Codes the server sends that have their own message; anything else reads as `generic`. */
const KNOWN_CODES: readonly string[] = [
  ...REQUEST_ERRORS,
  'access_denied',
  'account_encrypted',
  'temporarily_unavailable',
];

function toErrorKey(e: unknown): ConsentErrorKey {
  const code = oauthErrorCode(e);
  if (code && KNOWN_CODES.includes(code)) return code as ConsentErrorKey;
  const status = httpStatusOf(e);
  if (status === 404) return 'unavailable';
  if (status === 503) return 'temporarily_unavailable';
  return 'generic';
}

interface Loaded {
  app: OAuthConsentApp;
  scopes: OAuthScope[];
  accounts: OAuthConsentAccount[];
}

/**
 * The consent page's whole behaviour (Public API phase 1, spec §2 step 4). Signed out, it stashes
 * the request and sends the visitor to sign in (`useOAuthConsentResume` brings them back). Signed
 * in, it asks the server to validate the request and, on Allow/Deny, navigates ONLY to the URL the
 * server returns.
 */
export function useConsent(searchParams: RawSearchParams): ConsentState {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const params = useMemo(() => pickConsentParams(searchParams), [searchParams]);
  // expo-router hands out a fresh params object on every render; key the effects on content.
  const paramsKey = consentParamsKey(params);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [status, setStatus] = useState<ConsentStatus>('loading');
  const [error, setError] = useState<ConsentErrorKey | undefined>();
  const [submitError, setSubmitError] = useState<ConsentErrorKey | undefined>();
  const [pendingDecision, setPendingDecision] = useState<'allow' | 'deny' | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus('loading');
      void stashPendingConsent(paramsRef.current)
        .catch((e) => console.warn('[useConsent] stash failed:', e))
        .finally(() => router.replace('/(auth)/login' as never));
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(undefined);
    setSubmitError(undefined);
    oauthApi
      .preview(paramsRef.current)
      .then((preview) => {
        if (cancelled) return;
        setLoaded({ app: preview.app, scopes: preview.scopes, accounts: preview.accounts });
        setSelectedAccountIds(initialAccountSelection(preview.accounts));
        setStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[useConsent] preview failed:', e);
        setError(toErrorKey(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, paramsKey]);

  const accounts = loaded?.accounts;
  const toggle = useCallback(
    (id: string) => {
      const account = accounts?.find((a) => a.id === id);
      if (!account?.selectable) return;
      setSelectedAccountIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    [accounts],
  );

  const decide = useCallback(
    async (decision: 'allow' | 'deny') => {
      if (status !== 'ready' || inFlight.current) return;
      if (decision === 'allow' && selectedAccountIds.length === 0) return;
      inFlight.current = true;
      setStatus('submitting');
      setPendingDecision(decision);
      setSubmitError(undefined);
      const p = paramsRef.current;
      try {
        const { redirectTo } = await oauthApi.approve({
          client_id: p.client_id,
          redirect_uri: p.redirect_uri,
          scope: p.scope,
          state: p.state,
          code_challenge: p.code_challenge,
          code_challenge_method: p.code_challenge_method,
          ...(decision === 'allow'
            ? { account_ids: (accounts ?? []).filter((a) => selectedAccountIds.includes(a.id)).map((a) => a.id) }
            : {}),
          decision,
        });
        await openRedirect(redirectTo);
        setStatus('done');
      } catch (e) {
        console.warn('[useConsent] approve failed:', e);
        const key = toErrorKey(e);
        if (REQUEST_ERRORS.includes(key)) {
          setError(key);
          setStatus('error');
        } else {
          setSubmitError(key);
          setStatus('ready');
        }
      } finally {
        inFlight.current = false;
        setPendingDecision(null);
      }
    },
    [status, selectedAccountIds, accounts],
  );

  const allow = useCallback(() => decide('allow'), [decide]);
  const deny = useCallback(() => decide('deny'), [decide]);

  return {
    status,
    error,
    submitError,
    pendingDecision,
    app: loaded?.app ?? null,
    scopes: loaded?.scopes ?? [],
    accounts: loaded?.accounts ?? [],
    selectedAccountIds,
    toggle,
    isReconsent: (loaded?.accounts ?? []).some((a) => a.connected),
    allow,
    deny,
  };
}
