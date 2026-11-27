import { SUPPORT_EMAIL_LANGS, supportEmailCopy } from './support-email-i18n';

describe('support e-mail copy', () => {
  it('covers all 11 app locales with every field filled', () => {
    expect([...SUPPORT_EMAIL_LANGS].sort()).toEqual(['be', 'br', 'de', 'en', 'es', 'fr', 'nl', 'pl', 'pt', 'ru', 'ua']);
    for (const l of SUPPORT_EMAIL_LANGS) {
      const c = supportEmailCopy(l);
      for (const k of ['subject', 'heading', 'intro', 'original', 'cta', 'footer', 'unsubscribe', 'unsubscribedTitle', 'unsubscribedBody'] as const) {
        expect(c[k].length).toBeGreaterThan(2);
      }
      expect(c.greeting('Ann')).toContain('Ann');
    }
  });

  it('falls back to English, including for inherited property names', () => {
    expect(supportEmailCopy('xx').subject).toBe('Reply from the developer');
    expect(supportEmailCopy(null).subject).toBe('Reply from the developer');
    expect(supportEmailCopy('constructor').subject).toBe('Reply from the developer');
  });
});
