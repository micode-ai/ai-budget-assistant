import { resolveAppLocale, resolveAcceptLanguage, toIntlLocale } from './app-locale';

const S = ['en', 'pt', 'br', 'ua', 'nl'];

describe('resolveAppLocale', () => {
  it.each([
    ['pt-BR', 'br'],
    ['pt_br', 'br'],
    ['pt', 'br'],
    ['pt-PT', 'pt'],
    ['pt-AO', 'pt'],
    ['uk', 'ua'],
    ['nl-BE', 'nl'],
    ['EN-us', 'en'],
    ['xx', null],
    ['', null],
  ])('%s -> %s', (tag, expected) => {
    expect(resolveAppLocale(tag, S)).toBe(expected);
  });

  it('returns null for undefined/null', () => {
    expect(resolveAppLocale(undefined, S)).toBeNull();
    expect(resolveAppLocale(null, S)).toBeNull();
  });

  it('returns null when the mapped code is not supported', () => {
    expect(resolveAppLocale('pt-BR', ['en'])).toBeNull();
  });
});

describe('resolveAcceptLanguage', () => {
  it('takes the first hit in order', () => {
    expect(resolveAcceptLanguage('pt-BR,pt;q=0.9,en;q=0.8', S)).toBe('br');
    expect(resolveAcceptLanguage('fr-FR,pt-PT;q=0.5', S)).toBe('pt');
  });
  it('returns null for empty or unmatched', () => {
    expect(resolveAcceptLanguage(undefined, S)).toBeNull();
    expect(resolveAcceptLanguage('fr-FR,de', S)).toBeNull();
  });
});

describe('toIntlLocale', () => {
  it('maps codes', () => {
    expect(toIntlLocale('br')).toBe('pt-BR');
    expect(toIntlLocale('pt')).toBe('pt-PT');
    expect(toIntlLocale('ua')).toBe('uk-UA');
    expect(toIntlLocale('zz')).toBe('en-US');
  });
});
