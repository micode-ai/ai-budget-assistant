import en from '../en';
import de from '../de';
import es from '../es';
import fr from '../fr';
import pl from '../pl';
import ru from '../ru';
import ua from '../ua';
import be from '../be';
import nl from '../nl';

const locales = { en, de, es, fr, pl, ru, ua, be, nl } as const;

describe('accounts.displayCurrency i18n key', () => {
  for (const [name, loc] of Object.entries(locales)) {
    it(`${name}.accounts.displayCurrency is a non-empty string`, () => {
      const accounts = (loc as any).accounts;
      expect(accounts).toBeDefined();
      expect(typeof accounts.displayCurrency).toBe('string');
      expect(accounts.displayCurrency.length).toBeGreaterThan(0);
    });
  }
});
