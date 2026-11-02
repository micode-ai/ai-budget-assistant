import { appConnectedCopy } from './app-connected-email-i18n';

describe('appConnectedCopy', () => {
  it('falls back to English for unknown, empty and prototype-key languages', () => {
    const en = appConnectedCopy('en');
    for (const lang of ['xx', '', null, undefined, 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(appConnectedCopy(lang as string | null | undefined)).toBe(en);
    }
  });

  it('returns the requested language when it exists', () => {
    expect(appConnectedCopy('nl')).not.toBe(appConnectedCopy('en'));
  });
});
