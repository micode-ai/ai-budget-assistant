import type { SupportMessageView } from '@budget/shared-types';
import { bubbleLang, supportLangTag } from '../supportDisplay';

function msg(over: Partial<SupportMessageView>): SupportMessageView {
  return {
    id: 'm1',
    author: 'developer',
    body: 'Привет',
    bodyLang: 'ru',
    translatedBody: 'Cześć',
    translatedLang: 'pl',
    readAt: null,
    createdAt: '2026-11-27T10:00:00.000Z',
    ...over,
  };
}

describe('supportLangTag', () => {
  it('returns undefined for und, empty, null and malformed codes', () => {
    expect(supportLangTag('und')).toBeUndefined();
    expect(supportLangTag('')).toBeUndefined();
    expect(supportLangTag(null)).toBeUndefined();
    expect(supportLangTag(undefined)).toBeUndefined();
    expect(supportLangTag('not a lang')).toBeUndefined();
  });

  it('maps app codes to BCP-47 tags and never emits raw br or ua', () => {
    expect(supportLangTag('br')).toBe('pt-BR');
    expect(supportLangTag('pt')).toBe('pt-PT');
    expect(supportLangTag('ua')).toBe('uk');
  });

  it('passes a plain ISO 639 code through, lowercased', () => {
    expect(supportLangTag('it')).toBe('it');
    expect(supportLangTag('UK')).toBe('uk');
  });
});

describe('bubbleLang', () => {
  it('is the translation language when the translation is on screen', () => {
    expect(bubbleLang(msg({}), true, false)).toBe('pl');
    expect(bubbleLang(msg({ translatedLang: 'br', translatedBody: 'Olá' }), true, false)).toBe('pt-BR');
  });

  it('is the original language when the original is on screen', () => {
    expect(bubbleLang(msg({}), true, true)).toBe('ru');
    expect(bubbleLang(msg({}), false, false)).toBe('ru');
  });

  it('keeps an ISO body language as detected (pt is not forced to pt-PT)', () => {
    expect(bubbleLang(msg({ bodyLang: 'pt' }), false, false)).toBe('pt');
  });

  it('uses the body language for a user message even though it carries a translation', () => {
    expect(bubbleLang(msg({ author: 'user', bodyLang: 'en', translatedLang: 'ru' }), true, false)).toBe('en');
  });

  it('is undefined when the language was not detected', () => {
    expect(bubbleLang(msg({ bodyLang: 'und', translatedBody: null, translatedLang: null }), true, false)).toBeUndefined();
  });
});
