import {
  docsLanguage,
  publicApiDocsUrl,
  developerAppErrorKey,
  parseRedirectUris,
  isPublicApiUnavailable,
  isAllowedRedirectUri,
  isHttpsUrl,
  singleLine,
  copyValue,
} from '../developerApps';

describe('docsLanguage', () => {
  // Catches: a user reading the app in Ukrainian or Belarusian being sent to the
  // English guide when a Russian one exists, or a Polish user to the English one.
  it('maps the nine UI languages onto the three documented ones', () => {
    expect(docsLanguage('pl')).toBe('pl');
    expect(docsLanguage('ru')).toBe('ru');
    expect(docsLanguage('ua')).toBe('ru');
    expect(docsLanguage('be')).toBe('ru');
    for (const lang of ['en', 'de', 'es', 'fr', 'nl']) expect(docsLanguage(lang)).toBe('en');
  });

  it('reads a region-tagged code and falls back to English for anything unknown', () => {
    expect(docsLanguage('pl-PL')).toBe('pl');
    expect(docsLanguage('ru_RU')).toBe('ru');
    expect(docsLanguage(undefined)).toBe('en');
    expect(docsLanguage('')).toBe('en');
  });
});

describe('publicApiDocsUrl', () => {
  // Catches: the docs link pointing under `/api/v1` — the public docs are unprefixed.
  it('builds the unprefixed docs URL from the API base URL', () => {
    expect(publicApiDocsUrl('pl', 'https://api.ai-budget.pl/api/v1')).toBe('https://api.ai-budget.pl/public/docs/pl');
    expect(publicApiDocsUrl('ua', 'https://api.ai-budget.pl/api/v1/')).toBe('https://api.ai-budget.pl/public/docs/ru');
    expect(publicApiDocsUrl('de', 'http://localhost:3000/api/v1')).toBe('http://localhost:3000/public/docs/en');
  });

  it('falls back to the production host when the base URL does not parse', () => {
    expect(publicApiDocsUrl('en', 'not a url')).toBe('https://api.ai-budget.pl/public/docs/en');
  });
});

describe('developerAppErrorKey', () => {
  const err = (message: string, status?: number) => Object.assign(new Error(message), { status });

  it('names the server codes the form can explain', () => {
    expect(developerAppErrorKey(err('app_limit_reached', 400))).toBe('developerApps.errors.limit');
    expect(developerAppErrorKey(err('public_client_has_no_secret', 400))).toBe('developerApps.errors.publicClient');
    expect(developerAppErrorKey(err('each redirect URI must be https://', 400))).toBe('developerApps.errors.invalid');
    expect(developerAppErrorKey(err('App not found', 404))).toBe('developerApps.errors.notFound');
    expect(developerAppErrorKey(err('app_name_reserved: name must not be or start with "AI Budget"', 400))).toBe(
      'developerApps.errors.nameReserved',
    );
    expect(developerAppErrorKey(new Error('Network request failed'))).toBe('developerApps.errors.generic');
    expect(developerAppErrorKey(null)).toBe('developerApps.errors.generic');
  });
});

describe('parseRedirectUris', () => {
  it('splits on new lines, trims, and drops blanks and exact duplicates', () => {
    expect(parseRedirectUris(' https://a.example/cb \n\nhttps://b.example/cb\r\nhttps://a.example/cb\n')).toEqual([
      'https://a.example/cb',
      'https://b.example/cb',
    ]);
    expect(parseRedirectUris('')).toEqual([]);
  });
});

describe('isPublicApiUnavailable', () => {
  it('is true only for a 404', () => {
    expect(isPublicApiUnavailable(Object.assign(new Error('x'), { status: 404 }))).toBe(true);
    expect(isPublicApiUnavailable(Object.assign(new Error('x'), { status: 500 }))).toBe(false);
    expect(isPublicApiUnavailable(new Error('offline'))).toBe(false);
  });
});

describe('isAllowedRedirectUri', () => {
  // Mirrors apps/api/src/modules/oauth/redirect-uri.util.ts so the form can say what is wrong
  // before the server refuses the whole registration.
  it('accepts https and local http only', () => {
    expect(isAllowedRedirectUri('https://example.com/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:8080/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://example.com/cb')).toBe(false);
    expect(isAllowedRedirectUri('https://example.com/cb#x')).toBe(false);
    expect(isAllowedRedirectUri('https://user@example.com/cb')).toBe(false);
    expect(isAllowedRedirectUri('myapp://cb')).toBe(false);
  });

  // The server parses with URL; the old regex refused these, which the server accepts.
  it('agrees with the server on URL-parsed edge cases', () => {
    expect(isAllowedRedirectUri('http://localhost?x=1')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost')).toBe(true);
    expect(isAllowedRedirectUri('HTTP://LOCALHOST:3000/cb')).toBe(true);
    expect(isAllowedRedirectUri('https://example.com?x=1')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost.evil.com/cb')).toBe(false);
    expect(isAllowedRedirectUri('https://:pw@example.com/cb')).toBe(false);
    expect(isAllowedRedirectUri('https://')).toBe(false);
    expect(isAllowedRedirectUri('not a url')).toBe(false);
    expect(isAllowedRedirectUri('')).toBe(false);
    expect(isAllowedRedirectUri(`https://e.com/${'a'.repeat(2048)}`)).toBe(false);
  });
});

describe('copyValue', () => {
  // Catches: a clipboard rejection (web without permission, an insecure origin) bubbling up as an
  // unhandled promise and leaving the user with no feedback at all, on a secret shown only once.
  it("reports 'copied' when the clipboard write succeeds", async () => {
    const write = jest.fn().mockResolvedValue(true);
    await expect(copyValue(write, 'aba_cs_x')).resolves.toBe('copied');
    expect(write).toHaveBeenCalledWith('aba_cs_x');
  });

  it("reports 'failed' instead of throwing when the clipboard rejects or refuses", async () => {
    await expect(copyValue(jest.fn().mockRejectedValue(new Error('NotAllowedError')), 'v')).resolves.toBe('failed');
    await expect(copyValue(jest.fn().mockResolvedValue(false), 'v')).resolves.toBe('failed');
    await expect(
      copyValue(() => {
        throw new Error('sync');
      }, 'v'),
    ).resolves.toBe('failed');
  });
});

describe('singleLine', () => {
  // The server refuses line breaks and control characters in an app's name and description.
  it('folds line breaks, tabs and control characters into single spaces', () => {
    expect(singleLine('  Syncs\nexpenses\r\n\tdaily\u2028ok\u0000 ')).toBe('Syncs expenses daily ok');
    expect(singleLine('Plain')).toBe('Plain');
  });
});

describe('isHttpsUrl', () => {
  it('requires https and a dotted host', () => {
    expect(isHttpsUrl('https://example.com')).toBe(true);
    expect(isHttpsUrl(' https://example.com/privacy ')).toBe(true);
    expect(isHttpsUrl('http://example.com')).toBe(false);
    expect(isHttpsUrl('example.com')).toBe(false);
  });
});
