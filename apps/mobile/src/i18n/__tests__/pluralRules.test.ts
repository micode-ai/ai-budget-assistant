import { getLocales } from 'expo-localization';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));
jest.mock('@/services/secureStorage', () => ({ secureStorage: { getItem: jest.fn(), setItem: jest.fn() } }));
jest.mock('@/services/api', () => ({ api: { updateProfile: jest.fn() } }));

// i18next builds `new Intl.PluralRules(lng)`: raw `br` is Breton (one/two/few/many/other)
// and bare `pt` is ICU's Brazilian rule. Plurals must follow pt-BR and pt-PT.
let i18n: any;

beforeAll(() => {
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  (getLocales as jest.Mock).mockReturnValue([{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]);
  jest.isolateModules(() => {
    i18n = require('../index').default;
  });
});

describe('br plurals follow pt-BR, not Breton', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('br');
  });
  it('count 2 uses the br _other form', () => {
    expect(i18n.t('dates.weeksAgo', { count: 2 })).toBe('Há 2 semanas');
  });
  it('count 21 uses the br _other form', () => {
    expect(i18n.t('dates.weeksAgo', { count: 21 })).toBe('Há 21 semanas');
  });
  it('count 1 uses the br _one form', () => {
    expect(i18n.t('dates.weeksAgo', { count: 1 })).toBe('Há 1 semana');
  });
});

describe('pt plurals follow pt-PT', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('pt');
  });
  it('count 0 uses the _other form (PT-PT rule)', () => {
    expect(i18n.t('dates.weeksAgo', { count: 0 })).toBe('Há 0 semanas');
  });
  it('count 1 uses the _one form', () => {
    expect(i18n.t('dates.weeksAgo', { count: 1 })).toBe('Há 1 semana');
  });
});
