import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { OAuthConsentAccount, OAuthConsentApp, OAuthScope } from '@/services/oauth.api';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The i18n key of a scope's plain-language line. Scope strings contain `:`, which i18next reads as
 * its namespace separator, so they cannot be used as keys directly.
 */
const SCOPE_LABEL_KEYS: Record<OAuthScope, string> = {
  'expenses:read': 'oauthConsent.scopes.expensesRead',
  'expenses:write': 'oauthConsent.scopes.expensesWrite',
  'receipts:read': 'oauthConsent.scopes.receiptsRead',
  'categories:read': 'oauthConsent.scopes.categoriesRead',
  'incomes:read': 'oauthConsent.scopes.incomesRead',
  'incomes:write': 'oauthConsent.scopes.incomesWrite',
  'budgets:read': 'oauthConsent.scopes.budgetsRead',
  'budgets:write': 'oauthConsent.scopes.budgetsWrite',
  'analytics:read': 'oauthConsent.scopes.analyticsRead',
};

const SCOPE_ICONS: Record<OAuthScope, IconName> = {
  'expenses:read': 'eye-outline',
  'expenses:write': 'create-outline',
  'receipts:read': 'receipt-outline',
  'categories:read': 'pricetags-outline',
  'incomes:read': 'trending-up-outline',
  'incomes:write': 'cash-outline',
  'budgets:read': 'pie-chart-outline',
  'budgets:write': 'wallet-outline',
  'analytics:read': 'stats-chart-outline',
};

export function scopeLabelKey(scope: string): string {
  return SCOPE_LABEL_KEYS[scope as OAuthScope] ?? 'oauthConsent.scopes.unknown';
}

export function scopeIcon(scope: string): IconName {
  return SCOPE_ICONS[scope as OAuthScope] ?? 'help-circle-outline';
}

/** `https://www.example.com/path` → `www.example.com`; null when the URL does not parse. */
export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (host) return host;
  } catch {
    // fall through to the plain parse below
  }
  // Authority without userinfo or port; covers a URL implementation that lacks `hostname`. Only a
  // plain ASCII host is accepted here: anything else is shown as nothing, never as text that no
  // parser validated.
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i.exec(url);
  if (!m) return null;
  const host = m[1].toLowerCase();
  return /^[a-z0-9.-]+$/.test(host) ? host : null;
}

/**
 * The app's homepage / privacy-policy URL when it is safe to open: `http(s)` only. Registration
 * already restricts these, but the page is the last line before `Linking.openURL`, which on web is
 * `window.open` — a `javascript:` URL there would run in our origin.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/**
 * The "Website" link of a Connected apps card: http(s) only, and never for an app registered
 * automatically by an AI assistant — its homepage is self-declared (R11), so it is not something
 * to tap, whatever the server sent.
 */
export function connectedAppWebsiteUrl(app: {
  homepageUrl: string | null;
  registeredByAssistant?: boolean;
}): string | null {
  if (app.registeredByAssistant) return null;
  return safeExternalUrl(app.homepageUrl);
}

// --- Punycode (RFC 3492) -----------------------------------------------------------------------
// The URL implementation the app runs on is not guaranteed to apply IDNA (Expo's polyfill is
// `whatwg-url-without-unicode`), so a homograph host like `аpple.com` (Cyrillic `а`) would reach
// the screen looking like the real thing. Encoding it here makes the spoof visible: `xn--pple-43d.com`.
const PC_BASE = 36;
const PC_TMIN = 1;
const PC_TMAX = 26;
const PC_SKEW = 38;
const PC_DAMP = 700;

function pcAdapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / PC_DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((PC_BASE - PC_TMIN) * PC_TMAX) >> 1) {
    d = Math.floor(d / (PC_BASE - PC_TMIN));
    k += PC_BASE;
  }
  return k + Math.floor(((PC_BASE - PC_TMIN + 1) * d) / (d + PC_SKEW));
}

function pcDigit(d: number): string {
  return String.fromCharCode(d < 26 ? d + 97 : d + 22);
}

function punycodeEncodeLabel(label: string): string {
  const cps = Array.from(label, (c) => c.codePointAt(0) as number);
  let out = cps.filter((c) => c < 0x80).map((c) => String.fromCharCode(c)).join('');
  const basic = out.length;
  let handled = basic;
  if (basic > 0) out += '-';
  let n = 0x80;
  let delta = 0;
  let bias = 72;
  while (handled < cps.length) {
    let m = Number.MAX_SAFE_INTEGER;
    for (const c of cps) if (c >= n && c < m) m = c;
    delta += (m - n) * (handled + 1);
    n = m;
    for (const c of cps) {
      if (c < n) delta += 1;
      if (c === n) {
        let q = delta;
        for (let k = PC_BASE; ; k += PC_BASE) {
          const t = k <= bias ? PC_TMIN : k >= bias + PC_TMAX ? PC_TMAX : k - bias;
          if (q < t) break;
          out += pcDigit(t + ((q - t) % (PC_BASE - t)));
          q = Math.floor((q - t) / (PC_BASE - t));
        }
        out += pcDigit(q);
        bias = pcAdapt(delta, handled + 1, handled === basic);
        delta = 0;
        handled += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return out;
}

/** A host in its ASCII (punycode) form, lower-cased: `münchen.de` → `xn--mnchen-3ya.de`. */
export function toAsciiHost(host: string): string {
  return host
    .toLowerCase()
    .split('.')
    .map((label) => (/^[\x00-\x7f]*$/.test(label) ? label : `xn--${punycodeEncodeLabel(label)}`))
    .join('.');
}

/** Bidi overrides/isolates, zero-width and control characters: they can reorder or hide text. */
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;

/** Longest name shown for an assistant-registered app (code points); a longer one is cut with `…`. */
export const MAX_ASSISTANT_NAME_LENGTH = 80;

/** A plain ASCII host, or a bracketed IPv6 literal. */
const PLAIN_HOST = /^(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])$/;

export interface ConsentAppDisplay {
  name: string;
  verified: boolean;
  /** i18n key of the badge text. */
  badgeKey: 'oauthConsent.verified' | 'oauthConsent.notVerified' | 'oauthConsent.registeredByAssistant';
  /** Homepage as a bare host (punycode for an assistant-registered app); null = show nothing. */
  homepageHost: string | null;
  /** The URL the host opens; null = render the host as plain text, not a link. */
  homepageLinkUrl: string | null;
  privacyLinkUrl: string | null;
  /** Logo to load; null = no image. */
  logoUrl: string | null;
  /** Show the generic app icon instead of the first-letter tile (assistant-registered apps). */
  genericLogo: boolean;
  /**
   * R11: for an assistant-registered app, the ASCII (punycode) host the authorization code will be
   * sent to — the host of this request's validated redirect URI, from the server. Null otherwise.
   */
  redirectHost: string | null;
}

/**
 * What the consent page shows about the app. A manual (developer-registered) app is shown as it
 * always was. An app registered automatically by an AI assistant has no owner and nobody vouched
 * for any of its metadata, so it is treated as untrusted text (spec decision 4): its own badge,
 * the homepage only as a punycode host with no link, no privacy link, never its logo (R11: always
 * the generic icon — fetching a self-declared URL would also hand the viewer's IP address to
 * whoever registered it), a name stripped of characters that reorder or hide text and cut at 80,
 * and — the one fact about it that is not self-declared — the punycode host the code is sent to.
 */
export function consentAppDisplay(app: OAuthConsentApp): ConsentAppDisplay {
  if (!app.registeredByAssistant) {
    const homepageUrl = safeExternalUrl(app.homepageUrl);
    const host = homepageUrl ? hostnameOf(homepageUrl) : null;
    return {
      name: app.name,
      verified: app.isVerified,
      badgeKey: app.isVerified ? 'oauthConsent.verified' : 'oauthConsent.notVerified',
      homepageHost: host,
      homepageLinkUrl: host ? homepageUrl : null,
      privacyLinkUrl: safeExternalUrl(app.privacyPolicyUrl),
      logoUrl: app.logoUrl,
      genericLogo: false,
      redirectHost: null,
    };
  }
  const homepageUrl = safeExternalUrl(app.homepageUrl);
  const host = homepageUrl ? hostnameOf(homepageUrl) : null;
  const chars = Array.from(app.name.replace(UNSAFE_NAME_CHARS, '').trim());
  const name =
    chars.length > MAX_ASSISTANT_NAME_LENGTH
      ? `${chars.slice(0, MAX_ASSISTANT_NAME_LENGTH - 1).join('').trimEnd()}…`
      : chars.join('');
  // The server already sends punycode; encode again so an odd response can never put Unicode on
  // screen, and show nothing rather than something that is not a plain host.
  const rawRedirect = app.redirectHost?.trim().toLowerCase() ?? '';
  const redirectHost = rawRedirect ? toAsciiHost(rawRedirect) : '';
  return {
    name: name || '?',
    // Never verified, whatever the field says: verification is an admin act on an owned app.
    verified: false,
    badgeKey: 'oauthConsent.registeredByAssistant',
    homepageHost: host ? toAsciiHost(host) : null,
    homepageLinkUrl: null,
    privacyLinkUrl: null,
    logoUrl: null,
    genericLogo: true,
    redirectHost: PLAIN_HOST.test(redirectHost) ? redirectHost : null,
  };
}

/**
 * The accounts ticked when the page opens. A re-consent pre-ticks the connected accounts that are
 * STILL selectable: a connected account where the user is now a viewer (or that went end-to-end
 * encrypted) must stay unticked, or the server would refuse every approve with 403. A first
 * connection ticks nothing, unless exactly one account is selectable.
 */
export function initialAccountSelection(accounts: OAuthConsentAccount[]): string[] {
  if (accounts.some((a) => a.connected)) {
    return accounts.filter((a) => a.connected && a.selectable).map((a) => a.id);
  }
  const selectable = accounts.filter((a) => a.selectable);
  return selectable.length === 1 ? [selectable[0].id] : [];
}
