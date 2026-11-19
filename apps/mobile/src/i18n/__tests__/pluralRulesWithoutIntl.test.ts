import { getLocales } from 'expo-localization';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));
jest.mock('@/services/secureStorage', () => ({ secureStorage: { getItem: jest.fn(), setItem: jest.fn() } }));
jest.mock('@/services/api', () => ({ api: { updateProfile: jest.fn() } }));

// Hermes on Android has no Intl.PluralRules, so `new Intl.PluralRules(...)` throws for every
// tag. i18next then retries a hyphenated tag with its language part through `this.getRule`, and
// the pt/br remap in i18n/index.ts once sent that retry straight back to `pt-PT` — infinite
// recursion, "Maximum call stack size exceeded" on the home tab for every pt/br Android user.
let i18n: any;
const RealPluralRules = Intl.PluralRules;

beforeAll(() => {
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (getLocales as jest.Mock).mockReturnValue([{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]);
  (Intl as any).PluralRules = function PluralRulesUnavailable() {
    throw new TypeError('Intl.PluralRules is not a constructor');
  };
  jest.isolateModules(() => {
    i18n = require('../index').default;
  });
});

afterAll(() => {
  (Intl as any).PluralRules = RealPluralRules;
});

describe.each(['pt', 'br'])('%s plurals without Intl.PluralRules (Hermes on Android)', (lng) => {
  beforeAll(async () => {
    await i18n.changeLanguage(lng);
  });

  it('a counted string renders instead of overflowing the stack', () => {
    expect(() => i18n.t('dates.weeksAgo', { count: 2 })).not.toThrow();
    expect(i18n.t('dates.weeksAgo', { count: 2 })).toBe('Há 2 semanas');
    expect(i18n.t('dates.weeksAgo', { count: 1 })).toBe('Há 1 semana');
  });
});
