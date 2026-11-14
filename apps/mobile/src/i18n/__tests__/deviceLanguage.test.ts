import { getLocales } from 'expo-localization';
import { secureStorage } from '@/services/secureStorage';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));
jest.mock('@/services/secureStorage', () => ({ secureStorage: { getItem: jest.fn(), setItem: jest.fn() } }));
jest.mock('@/services/api', () => ({ api: { updateProfile: jest.fn() } }));

const mockLocales = getLocales as jest.Mock;

beforeAll(() => {
  // i18next prints a locize support notice on init.
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

function deviceLanguage(tag: string, languageCode: string, regionCode: string | null): string {
  mockLocales.mockReturnValue([{ languageTag: tag, languageCode, regionCode }]);
  let lang = '';
  jest.isolateModules(() => {
    lang = require('../index').default.language;
  });
  return lang;
}

describe('device language mapping', () => {
  it('pt-BR is Brazilian', () => expect(deviceLanguage('pt-BR', 'pt', 'BR')).toBe('br'));
  it('pt-PT is European', () => expect(deviceLanguage('pt-PT', 'pt', 'PT')).toBe('pt'));
  it('bare pt is Brazilian', () => expect(deviceLanguage('pt', 'pt', null)).toBe('br'));
  it('uk-UA is ua', () => expect(deviceLanguage('uk-UA', 'uk', 'UA')).toBe('ua'));
  it('ja-JP falls back to en', () => expect(deviceLanguage('ja-JP', 'ja', 'JP')).toBe('en'));
});

describe('stored language stays an internal code', () => {
  it('exposes pt (Portugal) and br (Brasil) with Intl-safe locales', () => {
    const { SUPPORTED_LANGUAGES } = require('../index');
    expect(SUPPORTED_LANGUAGES.map((l: { code: string }) => l.code)).toEqual(expect.arrayContaining(['pt', 'br']));
    expect(SUPPORTED_LANGUAGES).toHaveLength(11);
  });
});

describe('saved language and Intl locale', () => {
  it('a stored pt stays European (exact match, never re-resolved)', async () => {
    (secureStorage.getItem as jest.Mock).mockResolvedValue('pt');
    mockLocales.mockReturnValue([{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]);
    let mod: any;
    jest.isolateModules(() => {
      mod = require('../index');
    });
    await mod.loadSavedLanguage();
    expect(mod.default.language).toBe('pt');
    expect(mod.getIntlLocale()).toBe('pt-PT');
  });
  it('br maps to pt-BR for Intl', async () => {
    (secureStorage.getItem as jest.Mock).mockResolvedValue('br');
    mockLocales.mockReturnValue([{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]);
    let mod: any;
    jest.isolateModules(() => {
      mod = require('../index');
    });
    await mod.loadSavedLanguage();
    expect(mod.getIntlLocale()).toBe('pt-BR');
  });
});
