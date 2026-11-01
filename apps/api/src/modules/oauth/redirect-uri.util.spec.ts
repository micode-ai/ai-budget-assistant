import { isAllowedRedirectUri } from './redirect-uri.util';

describe('isAllowedRedirectUri', () => {
  it.each(['https://x.pl/cb', 'http://localhost:5173/cb', 'http://127.0.0.1/cb'])('accepts %s', (u) => {
    expect(isAllowedRedirectUri(u)).toBe(true);
  });
  it.each([
    'http://x.pl/cb',
    'https://x.pl/cb#frag',
    'javascript:alert(1)',
    'budget://x',
    'not a url',
    'https://user:pw@x.pl/cb',
    '',
  ])('rejects %s', (u) => {
    expect(isAllowedRedirectUri(u)).toBe(false);
  });
});
