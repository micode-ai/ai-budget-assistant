import { PromptBuilder } from './prompt-builder.service';

describe('PromptBuilder language detection', () => {
  const pb = new PromptBuilder();

  describe('detectLanguage', () => {
    it('classifies clearly French text (unique chars ç/è/ê/à) as French', () => {
      expect(pb.detectLanguage('Ça va coûter combien à la fin du mois ?')).toBe('French');
    });

    it('classifies clearly Spanish text (¿/ñ/á) as Spanish', () => {
      expect(pb.detectLanguage('¿Cuánto he gastado este mes en la compañía?')).toBe('Spanish');
    });

    it('does NOT classify French words containing only the shared "é" as Spanish', () => {
      // "dépenses", "café", "été" all contain é, which is common to both FR and ES.
      // The shared char must not force a Spanish classification.
      expect(pb.detectLanguage('Quelles sont mes dépenses ce mois-ci ?')).not.toBe('Spanish');
    });

    it('still detects Cyrillic, German and Polish', () => {
      expect(pb.detectLanguage('Сколько я потратил в этом месяце?')).toBe('Russian');
      expect(pb.detectLanguage('Wie viel habe ich für Lebensmittel ausgegeben?')).toBe('German');
      expect(pb.detectLanguage('Ile wydałem w tym miesiącu na zakupy?')).toBe('Polish');
    });
  });

  describe('detectUserLanguage', () => {
    it('reproduces the bug fix: French UI + ambiguous French message → French, never Spanish', () => {
      const lang = pb.detectUserLanguage('Quelles sont mes dépenses ce mois-ci ?', [], 'fr');
      expect(lang).toBe('French');
    });

    it('honors the UI locale for a plain ASCII message', () => {
      expect(pb.detectUserLanguage('ok', [], 'fr')).toBe('French');
      expect(pb.detectUserLanguage('ok', [], 'es')).toBe('Spanish');
      expect(pb.detectUserLanguage('ok', [], 'de')).toBe('German');
    });

    it('lets the message language override the UI locale when the script is unambiguous', () => {
      // French UI, but the user wrote in Russian → reply in Russian.
      expect(pb.detectUserLanguage('Сколько я потратил?', [], 'fr')).toBe('Russian');
    });

    it('disambiguates the shared "é" via the UI locale, both directions', () => {
      expect(pb.detectUserLanguage('un café', [], 'fr')).toBe('French');
      expect(pb.detectUserLanguage('un café', [], 'es')).toBe('Spanish');
    });

    it('falls back to recent assistant history when no UI locale is provided', () => {
      const history = [{ role: 'assistant', content: 'Voici vos dépenses pour ce mois-ci : ...' }];
      // assistant reply has "à"/"ç"? "Voici vos dépenses" — contains é only, so use a clearly-French reply
      const frHistory = [{ role: 'assistant', content: 'Voilà votre budget. Ça représente une grosse dépense.' }];
      expect(pb.detectUserLanguage('ok', frHistory, undefined)).toBe('French');
      void history;
    });

    it('defaults to English when nothing indicates another language', () => {
      expect(pb.detectUserLanguage('how much did I spend?', [], 'en')).toBe('English');
      expect(pb.detectUserLanguage('how much did I spend?', [], undefined)).toBe('English');
    });
  });
});
