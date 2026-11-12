import { domainToASCII } from 'url';
import type { OAuthConsentAccount, OAuthConsentApp } from '@/services/oauth.api';
import {
  connectedAppWebsiteUrl,
  consentAppDisplay,
  hostnameOf,
  initialAccountSelection,
  safeExternalUrl,
  scopeLabelKey,
  toAsciiHost,
} from '../consentDisplay';

describe('consentDisplay', () => {
  it('shows the homepage as a bare host', () => {
    expect(hostnameOf('https://www.example.com/about?x=1')).toBe('www.example.com');
    expect(hostnameOf('not a url')).toBeNull();
    expect(hostnameOf(null)).toBeNull();
  });

  it('the fallback parse accepts only a plain [a-z0-9.-] host, otherwise null', () => {
    // `new URL` throws on these, so the regex fallback decides.
    expect(hostnameOf('https://exa mple.com/x')).toBeNull();
    expect(hostnameOf('https://user@EXAMPLE.com:99999/x')).toBe('example.com');
  });

  it('opens only http(s) links', () => {
    expect(safeExternalUrl('https://example.com/privacy')).toBe('https://example.com/privacy');
    expect(safeExternalUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('  JavaScript:alert(1)')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });

  it('maps scopes to colon-free i18n keys', () => {
    expect(scopeLabelKey('expenses:write')).toBe('oauthConsent.scopes.expensesWrite');
    expect(scopeLabelKey('admin:all')).toBe('oauthConsent.scopes.unknown');
  });
});

function acc(id: string, over: Partial<OAuthConsentAccount> = {}): OAuthConsentAccount {
  return { id, name: id, type: 'personal', role: 'owner', selectable: true, reason: null, readOnly: false, connected: false, ...over };
}

describe('initialAccountSelection', () => {
  it('ticks nothing for two selectable accounts when none is connected', () => {
    expect(initialAccountSelection([acc('A'), acc('B')])).toEqual([]);
  });

  it('ticks the only selectable account (viewer row ignored)', () => {
    expect(initialAccountSelection([acc('V', { selectable: false, reason: 'viewer', role: 'viewer' }), acc('A')])).toEqual(['A']);
  });

  it('ticks the connected account among several selectable ones', () => {
    expect(initialAccountSelection([acc('A', { connected: true }), acc('B')])).toEqual(['A']);
  });

  it('never ticks a connected account that is no longer selectable', () => {
    expect(
      initialAccountSelection([
        acc('A', { connected: true }),
        acc('V', { connected: true, selectable: false, reason: 'viewer', role: 'viewer' }),
        acc('E', { connected: true, selectable: false, reason: 'encrypted' }),
        acc('B'),
      ]),
    ).toEqual(['A']);
  });

  it('does not fall back to the single selectable account when a connection exists but none of it is selectable', () => {
    expect(initialAccountSelection([acc('V', { connected: true, selectable: false, reason: 'viewer' }), acc('B')])).toEqual([]);
  });
});

describe('toAsciiHost (punycode for an untrusted homepage host)', () => {
  it('encodes non-ASCII labels as xn-- and leaves ASCII labels alone', () => {
    expect(toAsciiHost('münchen.de')).toBe('xn--mnchen-3ya.de');
    expect(toAsciiHost('bücher.example.com')).toBe('xn--bcher-kva.example.com');
    expect(toAsciiHost('www.example.com')).toBe('www.example.com');
    expect(toAsciiHost('Example.COM')).toBe('example.com');
  });

  it('matches Node IDNA output for homographs (Cyrillic letters inside a Latin-looking name)', () => {
    for (const host of ['аpple.com', 'пример.рф', 'ai-bуdget.pl']) {
      expect(toAsciiHost(host)).toBe(domainToASCII(host));
    }
  });
});

describe('consentAppDisplay', () => {
  const manual: OAuthConsentApp = {
    name: 'AI Accounting',
    logoUrl: 'http://cdn.example.com/logo.png',
    homepageUrl: 'https://www.example.com/about',
    privacyPolicyUrl: 'https://example.com/privacy',
    isVerified: false,
    developerName: 'Example Ltd',
  };
  const assistant: OAuthConsentApp = {
    name: 'Some Assistant',
    logoUrl: 'https://cdn.example.com/logo.png',
    homepageUrl: 'https://münchen.example/',
    privacyPolicyUrl: null,
    isVerified: false,
    developerName: null,
    registeredByAssistant: true,
  };

  it('picks the assistant badge text when registeredByAssistant', () => {
    expect(consentAppDisplay(assistant).badgeKey).toBe('oauthConsent.registeredByAssistant');
    expect(consentAppDisplay(assistant).verified).toBe(false);
  });

  it('keeps the existing badge for manual apps (verified / not verified)', () => {
    expect(consentAppDisplay(manual).badgeKey).toBe('oauthConsent.notVerified');
    expect(consentAppDisplay({ ...manual, isVerified: true }).badgeKey).toBe('oauthConsent.verified');
    expect(consentAppDisplay({ ...manual, registeredByAssistant: false }).badgeKey).toBe('oauthConsent.notVerified');
  });

  it('an assistant app: homepage as a punycode host, never a link; no privacy link', () => {
    const d = consentAppDisplay(assistant);
    expect(d.homepageHost).toBe('xn--mnchen-3ya.example');
    expect(d.homepageLinkUrl).toBeNull();
    expect(d.privacyLinkUrl).toBeNull();
    expect(consentAppDisplay({ ...assistant, privacyPolicyUrl: 'https://x.example/p' }).privacyLinkUrl).toBeNull();
    expect(consentAppDisplay({ ...assistant, homepageUrl: 'javascript:alert(1)' }).homepageHost).toBeNull();
  });

  it('an assistant app: never loads its logo (R11) — always the generic icon', () => {
    for (const logoUrl of ['https://cdn.example.com/logo.png', 'http://cdn.example.com/logo.png', 'data:image/png;base64,AAAA', 'javascript:x', null]) {
      expect(consentAppDisplay({ ...assistant, logoUrl })).toMatchObject({ logoUrl: null, genericLogo: true });
    }
  });

  it('an assistant app: the redirect host is shown in punycode (R11)', () => {
    expect(consentAppDisplay({ ...assistant, redirectHost: 'claude.ai' }).redirectHost).toBe('claude.ai');
    expect(consentAppDisplay({ ...assistant, redirectHost: 'xn--pple-43d.com' }).redirectHost).toBe('xn--pple-43d.com');
    // an older or odd response with Unicode is encoded, never shown as is
    expect(consentAppDisplay({ ...assistant, redirectHost: 'аpple.com' }).redirectHost).toBe('xn--pple-43d.com');
    expect(consentAppDisplay({ ...assistant, redirectHost: '[::1]' }).redirectHost).toBe('[::1]');
    for (const redirectHost of [null, undefined, '', 'evil.com/path', 'a b.com', 'x@y.com']) {
      expect(consentAppDisplay({ ...assistant, redirectHost }).redirectHost).toBeNull();
    }
  });

  it('a manual app never shows a redirect host, even if one is sent', () => {
    expect(consentAppDisplay({ ...manual, redirectHost: 'claude.ai' }).redirectHost).toBeNull();
  });

  it('an assistant app: the name is cut at 80 characters with an ellipsis', () => {
    const long = 'A'.repeat(200);
    const d = consentAppDisplay({ ...assistant, name: long });
    expect(Array.from(d.name)).toHaveLength(80);
    expect(d.name.endsWith('…')).toBe(true);
    expect(consentAppDisplay({ ...assistant, name: 'B'.repeat(80) }).name).toBe('B'.repeat(80));
    // counted in code points: an astral character is one
    expect(Array.from(consentAppDisplay({ ...assistant, name: '😀'.repeat(100) }).name)).toHaveLength(80);
  });

  it('an assistant app: bidi and control characters are stripped from the name', () => {
    expect(consentAppDisplay({ ...assistant, name: 'Good‮gpj.exe\u0007' }).name).toBe('Goodgpj.exe');
    expect(consentAppDisplay({ ...assistant, name: '‮‏ ' }).name).toBe('?');
  });

  it('a manual app is unchanged: clickable homepage host, privacy link, logo as given', () => {
    expect(consentAppDisplay(manual)).toMatchObject({
      name: 'AI Accounting',
      homepageHost: 'www.example.com',
      homepageLinkUrl: 'https://www.example.com/about',
      privacyLinkUrl: 'https://example.com/privacy',
      logoUrl: 'http://cdn.example.com/logo.png',
      genericLogo: false,
      redirectHost: null,
    });
    expect(consentAppDisplay({ ...manual, logoUrl: null })).toMatchObject({ logoUrl: null, genericLogo: false });
  });
});

describe('connectedAppWebsiteUrl (R11)', () => {
  it('a manual app links its http(s) homepage only', () => {
    expect(connectedAppWebsiteUrl({ homepageUrl: 'https://x.io' })).toBe('https://x.io');
    expect(connectedAppWebsiteUrl({ homepageUrl: 'https://x.io', registeredByAssistant: false })).toBe('https://x.io');
    expect(connectedAppWebsiteUrl({ homepageUrl: 'javascript:alert(1)' })).toBeNull();
    expect(connectedAppWebsiteUrl({ homepageUrl: null })).toBeNull();
  });

  it('an assistant-registered app never gets a link, even if a homepage is sent', () => {
    expect(connectedAppWebsiteUrl({ homepageUrl: 'https://x.io', registeredByAssistant: true })).toBeNull();
  });
});
