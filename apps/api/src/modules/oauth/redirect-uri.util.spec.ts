import { MAX_REDIRECT_URIS, firstRejectedNewRedirectUri, isAllowedRedirectUri, isAllowedRedirectUriShape } from './redirect-uri.util';

describe('isAllowedRedirectUri', () => {
  it.each(['https://x.pl/cb', 'http://localhost:5173/cb', 'http://127.0.0.1/cb', 'http://[::1]:5000/cb', 'http://[::1]/cb'])('accepts %s', (u) => {
    expect(isAllowedRedirectUri(u)).toBe(true);
  });
  it.each([
    'http://x.pl/cb',
    'https://x.pl/cb#frag',
    'javascript:alert(1)',
    'budget://x',
    'cursor://anysphere.cursor-retrieval/oauth/callback',
    'http://[::2]:5000/cb',
    'http://localhost.evil.com/cb',
    'https://x.pl/c\tb',
    'https://x.pl/cb\r\n',
    ' https://x.pl/cb',
    'https://x.pl/c b',
    'https://x.pl/c\u200Bb',
    'not a url',
    'https://user:pw@x.pl/cb',
    '',
  ])('rejects %s', (u) => {
    expect(isAllowedRedirectUri(u)).toBe(false);
  });
});

describe('MAX_REDIRECT_URIS', () => {
  it('is 5 (spec decision 7)', () => {
    expect(MAX_REDIRECT_URIS).toBe(5);
  });
});

describe('R13: the character rule applies to new URIs only', () => {
  const legacy = 'https://x.pl/c b'; // stored before the whitespace rule existed
  it('isAllowedRedirectUriShape keeps the structural rule but not the character rule', () => {
    expect(isAllowedRedirectUriShape(legacy)).toBe(true);
    expect(isAllowedRedirectUriShape(' https://x.pl/cb')).toBe(true);
    expect(isAllowedRedirectUri(legacy)).toBe(false);
    for (const u of ['http://x.pl/cb', 'https://x.pl/cb#f', 'budget://x', 'https://u:p@x.pl/cb', '']) {
      expect(isAllowedRedirectUriShape(u)).toBe(false);
    }
  });

  it('firstRejectedNewRedirectUri: stored URIs pass as they are, added ones must pass the full rule', () => {
    expect(firstRejectedNewRedirectUri([legacy, 'https://x.pl/new'], [legacy])).toBeNull();
    expect(firstRejectedNewRedirectUri([legacy], [])).toBe(legacy);
    expect(firstRejectedNewRedirectUri(['https://x.pl/ok', 'https://x.pl/a\tb'], [legacy])).toBe('https://x.pl/a\tb');
    // a changed spelling of a stored URI is a new URI
    expect(firstRejectedNewRedirectUri(['https://x.pl/c  b'], [legacy])).toBe('https://x.pl/c  b');
    expect(firstRejectedNewRedirectUri([], [legacy])).toBeNull();
  });
});
