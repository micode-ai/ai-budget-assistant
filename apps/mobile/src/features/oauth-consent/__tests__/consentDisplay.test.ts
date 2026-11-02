import type { OAuthConsentAccount } from '@/services/oauth.api';
import { hostnameOf, initialAccountSelection, safeExternalUrl, scopeLabelKey } from '../consentDisplay';

describe('consentDisplay', () => {
  it('shows the homepage as a bare host', () => {
    expect(hostnameOf('https://www.example.com/about?x=1')).toBe('www.example.com');
    expect(hostnameOf('not a url')).toBeNull();
    expect(hostnameOf(null)).toBeNull();
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
