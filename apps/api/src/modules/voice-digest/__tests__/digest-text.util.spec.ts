import type { DigestFacts } from '../digest-facts.util';
import {
  DIGEST_LANGS,
  fallbackText,
  extractNumbers,
  allowedNumbers,
  isFaithful,
  templateLanguage,
} from '../digest-text.util';

const fullFacts: DigestFacts = {
  currency: 'PLN',
  weekTotal: 820,
  usualWeek: 936,
  changePct: -12,
  topRise: { category: 'Groceries', changePct: 40 },
  safeToSpendToday: 64,
  daysToIncome: 5,
  shieldItem: { name: 'Mleko 3,2% 1L', monthlyChangePct: 4 },
  restock: ['milk', 'bread', 'eggs'],
  realChangePct: -3,
};

const weekOnlyFacts: DigestFacts = {
  currency: 'PLN',
  weekTotal: 820,
  usualWeek: null,
  changePct: null,
  topRise: null,
  safeToSpendToday: null,
  daysToIncome: null,
  shieldItem: null,
  restock: [],
  realChangePct: null,
};

describe('fallbackText', () => {
  it('en: contains the week total, change percentage and direction', () => {
    const text = fallbackText(fullFacts, 'en');
    expect(text).toContain('820 PLN');
    expect(text).toContain('12%');
    expect(text).toContain('below');
  });

  it('pl differs from en but still contains the week total', () => {
    const en = fallbackText(fullFacts, 'en');
    const pl = fallbackText(fullFacts, 'pl');
    expect(pl).not.toEqual(en);
    expect(pl).toContain('820 PLN');
  });

  it('every DIGEST_LANG produces non-empty text', () => {
    for (const lang of DIGEST_LANGS) {
      expect(fallbackText(fullFacts, lang).length).toBeGreaterThan(0);
    }
  });

  it('a facts object with only weekTotal produces one sentence', () => {
    const text = fallbackText(weekOnlyFacts, 'en');
    expect((text.match(/\./g) ?? []).length).toBe(1);
    expect(text).toContain('820 PLN');
  });
});

describe('extractNumbers', () => {
  it('parses a mixed-separator Polish phrase (space-grouped thousands, comma decimal)', () => {
    expect(extractNumbers('Wydałeś 1 234,50 zł, czyli 12% mniej')).toEqual([1234.5, 12]);
  });

  it('reads a dot-grouped, comma-decimal amount', () => {
    expect(extractNumbers('Spent 1.234,5 PLN')).toEqual([1234.5]);
  });

  it('ignores % and currency signs, which simply are not consumed by the digit match', () => {
    expect(extractNumbers('12% off, 5 EUR')).toEqual([12, 5]);
  });
});

describe('allowedNumbers', () => {
  it('includes numbers embedded in the shield item name, top-rise category and restock names', () => {
    const nums = allowedNumbers(fullFacts);
    expect(nums).toEqual(expect.arrayContaining([3.2, 1]));
  });
});

describe('isFaithful', () => {
  it('accepts a narration using only facts numbers', () => {
    expect(isFaithful('You spent 820 PLN, 12% below usual. 64 PLN a day for 5 days.', fullFacts)).toBe(
      true,
    );
  });

  it('rejects a narration with an invented number', () => {
    expect(isFaithful('You spent 820 PLN, 15% below usual.', fullFacts)).toBe(false);
  });

  it('round-trips a thousands-and-decimal amount', () => {
    expect(isFaithful('Spent 1.234,5 PLN', { ...fullFacts, weekTotal: 1234.5 })).toBe(true);
  });

  it('is faithful to a narration mentioning "Mleko 3,2% 1L"', () => {
    expect(isFaithful('Watch out, Mleko 3,2% 1L may cost more next month.', fullFacts)).toBe(true);
  });

  it('every DIGEST_LANG fallback is faithful to the full facts fixture', () => {
    for (const lang of DIGEST_LANGS) {
      expect(isFaithful(fallbackText(fullFacts, lang), fullFacts)).toBe(true);
    }
  });

  it('every DIGEST_LANG fallback is faithful to a weekTotal-only fixture', () => {
    for (const lang of DIGEST_LANGS) {
      expect(isFaithful(fallbackText(weekOnlyFacts, lang), weekOnlyFacts)).toBe(true);
    }
  });
});

describe('templateLanguage', () => {
  it('maps ua to uk and be to ru', () => {
    expect(templateLanguage('ua')).toBe('uk');
    expect(templateLanguage('be')).toBe('ru');
  });

  it('leaves other known languages unchanged', () => {
    expect(templateLanguage('en')).toBe('en');
    expect(templateLanguage('pl')).toBe('pl');
  });

  it('maps an unknown language to en', () => {
    expect(templateLanguage('xx')).toBe('en');
  });
});
