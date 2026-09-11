import { WHATS_NEW_ENTRIES } from '../whatsNewEntries';
import { sectionsMeta } from '@/help/sections';
import en from '@/i18n/locales/en';
import ru from '@/i18n/locales/ru';
import ua from '@/i18n/locales/ua';
import pl from '@/i18n/locales/pl';
import es from '@/i18n/locales/es';
import fr from '@/i18n/locales/fr';
import de from '@/i18n/locales/de';
import be from '@/i18n/locales/be';
import nl from '@/i18n/locales/nl';

const LOCALES = { en, ru, ua, pl, es, fr, de, be, nl } as const;

describe('WHATS_NEW_ENTRIES', () => {
  it('is non-empty', () => {
    expect(WHATS_NEW_ENTRIES.length).toBeGreaterThan(0);
  });

  it('every entry has a unique, permanent id', () => {
    const ids = WHATS_NEW_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has a route or a helpSectionId to send "Tell me more" to', () => {
    for (const entry of WHATS_NEW_ENTRIES) {
      expect(Boolean(entry.route || entry.helpSectionId)).toBe(true);
    }
  });

  it('every helpSectionId references a real registered help section', () => {
    const knownIds = new Set(sectionsMeta.map((m) => m.id));
    for (const entry of WHATS_NEW_ENTRIES) {
      if (entry.helpSectionId) {
        expect(knownIds.has(entry.helpSectionId)).toBe(true);
      }
    }
  });

  /**
   * The copy is no longer in this file — it lives at
   * `whatsNew.entries.<id>.{title,body}` in nine locale files. i18next returns
   * the key itself when a lookup misses, so a forgotten locale does not fail
   * loudly: it renders "whatsNew.entries.fat-finder.title" to the user. This
   * test is what makes that impossible to ship.
   */
  it('every entry has real title and body copy in all nine locales', () => {
    for (const [locale, bundle] of Object.entries(LOCALES)) {
      const entries = (bundle as Record<string, any>).whatsNew?.entries;
      expect(`${locale}: has entries`).toBe(entries ? `${locale}: has entries` : `${locale}: MISSING`);

      for (const entry of WHATS_NEW_ENTRIES) {
        const copy = entries?.[entry.id];
        const where = `${locale}/${entry.id}`;
        expect(typeof copy?.title === 'string' ? where : `${where}: title missing`).toBe(where);
        expect(typeof copy?.body === 'string' ? where : `${where}: body missing`).toBe(where);
        expect(copy.title.trim().length).toBeGreaterThan(0);
        expect(copy.body.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('no locale carries copy for an id that no longer exists', () => {
    // An entry removed from the array would otherwise leave nine dead strings
    // behind, and the id can never be reused.
    const known = new Set(WHATS_NEW_ENTRIES.map((e) => e.id));
    for (const [locale, bundle] of Object.entries(LOCALES)) {
      const entries = (bundle as Record<string, any>).whatsNew?.entries ?? {};
      for (const id of Object.keys(entries)) {
        expect(known.has(id) ? `${locale}/${id}` : `${locale}/${id}: orphaned`).toBe(`${locale}/${id}`);
      }
    }
  });
});
