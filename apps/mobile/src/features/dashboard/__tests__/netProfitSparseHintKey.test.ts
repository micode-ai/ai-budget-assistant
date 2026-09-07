import { NET_PROFIT_SPARSE_HINT_KEY } from '../netProfitSeries';
import en from '@/i18n/locales/en';
import de from '@/i18n/locales/de';
import es from '@/i18n/locales/es';
import fr from '@/i18n/locales/fr';
import nl from '@/i18n/locales/nl';
import pl from '@/i18n/locales/pl';
import ru from '@/i18n/locales/ru';
import ua from '@/i18n/locales/ua';
import be from '@/i18n/locales/be';

/**
 * The one string the sparse-history hero renders.
 *
 * `NetProfitWidget` used to hold this key inline in its JSX, where nothing in
 * this repo could see it: no component renders in CI, so a key that does not
 * exist ships as the raw dotted string `healthScore.notEnoughData` on screen,
 * and only in the locales nobody on the team reads. Declaring it as an
 * exported constant is what makes the check below possible at all.
 *
 * Every test names the single production change that would make it fail.
 */

const LOCALES: [string, Record<string, unknown>][] = [
  ['en', en],
  ['de', de],
  ['es', es],
  ['fr', fr],
  ['nl', nl],
  ['pl', pl],
  ['ru', ru],
  ['ua', ua],
  ['be', be],
];

function lookup(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, locale);
}

describe('NET_PROFIT_SPARSE_HINT_KEY', () => {
  for (const [name, locale] of LOCALES) {
    it(`resolves to real copy in ${name}`, () => {
      // Breaks if: the constant is pointed at a key that does not exist —
      // including a plausible-looking invented one such as
      // `dashboard.netProfitNeedsMoreMonths`. That is also what enforces the
      // "reuse an existing key, invent none" rule on this task: a new key
      // would have to land in all nine files before this goes green.
      const value = lookup(locale, NET_PROFIT_SPARSE_HINT_KEY);
      expect(typeof value).toBe('string');
      expect((value as string).trim().length).toBeGreaterThan(0);
    });
  }

  it('is a real dotted path, not a bare string that i18next would echo back', () => {
    // Breaks if: the constant is reduced to a single segment (a namespace
    // name, say), which resolves to an OBJECT rather than a string — i18next
    // renders that as the key itself, so the screen would print
    // "healthScore" where a sentence belongs.
    expect(NET_PROFIT_SPARSE_HINT_KEY).toContain('.');
    expect(typeof lookup(en, NET_PROFIT_SPARSE_HINT_KEY)).toBe('string');
  });

  it('carries no interpolation placeholder the widget does not supply', () => {
    // Breaks if: the constant is pointed at a key whose copy takes a variable
    // (e.g. `dashboard.used`, "{{percent}}% used"). The widget calls `t()`
    // with no params, so i18next would render the braces literally.
    for (const [, locale] of LOCALES) {
      expect(lookup(locale, NET_PROFIT_SPARSE_HINT_KEY)).not.toMatch(/\{\{/);
    }
  });
});
