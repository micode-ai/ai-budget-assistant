import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { OAuthConsentAccount, OAuthScope } from '@/services/oauth.api';

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
  // Authority without userinfo or port; covers a URL implementation that lacks `hostname`.
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
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
