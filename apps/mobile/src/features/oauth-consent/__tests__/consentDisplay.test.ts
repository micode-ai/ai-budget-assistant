import { hostnameOf, safeExternalUrl, scopeLabelKey } from '../consentDisplay';

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
