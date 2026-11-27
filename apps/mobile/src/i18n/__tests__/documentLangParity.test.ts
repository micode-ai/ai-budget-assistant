import { appLanguageTag } from '../documentLang';

// Loading `../index` the way deviceLanguage.test.ts does: its native dependencies are mocked.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }] }));
jest.mock('@/services/secureStorage', () => ({ secureStorage: { getItem: jest.fn(), setItem: jest.fn() } }));
jest.mock('@/services/api', () => ({ api: { updateProfile: jest.fn() } }));

beforeAll(() => {
  // i18next prints a locize support notice on init.
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('document-lang map parity', () => {
  it('has a <html lang> tag for every supported UI language (a new locale must not fall back to en)', () => {
    const { SUPPORTED_LANGUAGES } = require('../index') as typeof import('../index');
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.filter((c) => appLanguageTag(c) === undefined)).toEqual([]);
  });
});
