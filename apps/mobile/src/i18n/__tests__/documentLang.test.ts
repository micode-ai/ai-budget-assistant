import { applyDocumentLang, documentLangTag } from '../documentLang';

describe('documentLangTag', () => {
  it('maps every app language to a BCP-47 tag', () => {
    expect(documentLangTag('en')).toBe('en');
    expect(documentLangTag('pl')).toBe('pl');
    expect(documentLangTag('ru')).toBe('ru');
    expect(documentLangTag('ua')).toBe('uk');
    expect(documentLangTag('pt')).toBe('pt-PT');
    expect(documentLangTag('br')).toBe('pt-BR');
  });

  it('falls back to en for an unknown or missing code', () => {
    expect(documentLangTag('xx')).toBe('en');
    expect(documentLangTag('')).toBe('en');
    expect(documentLangTag(undefined)).toBe('en');
    expect(documentLangTag('toString')).toBe('en');
  });
});

describe('applyDocumentLang', () => {
  const g = globalThis as { document?: unknown };
  const original = g.document;
  afterEach(() => {
    if (original === undefined) delete g.document;
    else g.document = original;
  });

  it('is a no-op without a document (native)', () => {
    delete g.document;
    expect(() => applyDocumentLang('pl')).not.toThrow();
  });

  it('writes the tag onto <html lang>', () => {
    const documentElement = { lang: 'en' };
    g.document = { documentElement };
    applyDocumentLang('br');
    expect(documentElement.lang).toBe('pt-BR');
    applyDocumentLang('ua');
    expect(documentElement.lang).toBe('uk');
  });
});
