import { searchHelp, tokenize } from './help-search.util';
import * as helpIndex from './help-index.json';

const index = helpIndex as unknown as import('./help-search.util').HelpIndex;

describe('help-search.util', () => {
  it('tokenizes with diacritics folded and short words dropped', () => {
    expect(tokenize('Jak zmienić walutę?')).toEqual(['jak', 'zmienic', 'walute']);
    expect(tokenize('a to')).toEqual([]);
  });

  it('returns [] for an empty or too-short query', () => {
    expect(searchHelp(index, '', 'en')).toEqual([]);
    expect(searchHelp(index, 'a b', 'en')).toEqual([]);
  });

  it('finds the receipt split article in English', () => {
    const r = searchHelp(index, 'split receipt with friends', 'en');
    expect(r.length).toBeGreaterThan(0);
    expect(r.map((m) => m.sectionId)).toContain('42-receipt-split');
    expect(r[0].deepLink).toMatch(/^\/help\/\d\d-/);
    expect(r[0].excerpt.length).toBeLessThanOrEqual(701);
  });

  it.each([
    ['ru', 'как разделить чек между друзьями', '42-receipt-split'],
    ['pl', 'jak podzielić rachunek', '42-receipt-split'],
    ['de', 'Inflation Shield auf Vorrat kaufen', '40-inflation-shield'],
    ['es', 'escudo de inflación comprar por adelantado', '40-inflation-shield'],
  ])('matches in %s', (lang, query, sectionId) => {
    const r = searchHelp(index, query, lang, 5);
    expect(r.map((m) => m.sectionId)).toContain(sectionId);
  });

  it('falls back to English when the language has no match, and for unknown languages', () => {
    const fallback = searchHelp(index, 'inflation shield', 'xx');
    expect(fallback.length).toBeGreaterThan(0);
  });

  it('returns nothing for gibberish', () => {
    expect(searchHelp(index, 'zzqqxxyy wwvvuu', 'en')).toEqual([]);
  });

  it('respects the limit and never repeats a section', () => {
    const r = searchHelp(index, 'budget expense category', 'en', 3);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(new Set(r.map((m) => m.sectionId)).size).toBe(r.length);
  });
});
