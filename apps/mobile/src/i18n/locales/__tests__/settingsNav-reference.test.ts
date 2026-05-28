import en from '../en';
import de from '../de';
import es from '../es';
import fr from '../fr';
import pl from '../pl';
import ru from '../ru';
import ua from '../ua';
import be from '../be';

const locales = { en, de, es, fr, pl, ru, ua, be } as const;
const keys = [
  'referenceData',
  'referenceDataDesc',
  'tags',
  'tagsDesc',
  'projects',
  'projectsDesc',
] as const;

describe('settingsNav reference-data i18n keys', () => {
  for (const [name, loc] of Object.entries(locales)) {
    const nav = (loc as any).settingsNav;
    for (const key of keys) {
      it(`${name}.settingsNav.${key} is a non-empty string`, () => {
        expect(nav).toBeDefined();
        expect(typeof nav[key]).toBe('string');
        expect(nav[key].length).toBeGreaterThan(0);
      });
    }
  }
});
