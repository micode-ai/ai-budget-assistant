import {
  DIVISIONS, EUROSTAT_COUNTRIES, isDivision, divisionForSeedIcon, countryFromTimezone,
  isEurostatCountry, divisionLabel,
} from '../coicop';

describe('coicop', () => {
  it('lists TOTAL and the 13 COICOP 2018 divisions', () => {
    expect(DIVISIONS).toEqual([
      'TOTAL', 'CP01', 'CP02', 'CP03', 'CP04', 'CP05', 'CP06', 'CP07',
      'CP08', 'CP09', 'CP10', 'CP11', 'CP12', 'CP13',
    ]);
    expect(isDivision('CP13')).toBe(true);
    expect(isDivision('CP00')).toBe(false);
    expect(isDivision('cp01')).toBe(false);
  });

  it('maps every seed-category icon to a division', () => {
    // The seed icons are identical in all 9 languages (default-categories.ts).
    expect(divisionForSeedIcon('🛒')).toBe('CP01');
    expect(divisionForSeedIcon('🍔')).toBe('CP11');
    expect(divisionForSeedIcon('🍺')).toBe('CP02');
    expect(divisionForSeedIcon('💡')).toBe('CP04');
    expect(divisionForSeedIcon('🚗')).toBe('CP07');
    expect(divisionForSeedIcon('📱')).toBe('CP08');
    expect(divisionForSeedIcon('👕')).toBe('CP03');
    expect(divisionForSeedIcon('📦')).toBe('TOTAL');
    expect(divisionForSeedIcon('🦄')).toBeNull();
    expect(divisionForSeedIcon(null)).toBeNull();
  });

  it('guesses the country from a European timezone', () => {
    expect(countryFromTimezone('Europe/Warsaw')).toBe('PL');
    expect(countryFromTimezone('Europe/Athens')).toBe('EL');
    expect(countryFromTimezone('Europe/Kyiv')).toBeNull();
    expect(countryFromTimezone('UTC')).toBeNull();
    expect(countryFromTimezone(undefined)).toBeNull();
  });

  it('knows which countries Eurostat publishes', () => {
    expect(EUROSTAT_COUNTRIES).toContain('PL');
    expect(EUROSTAT_COUNTRIES).toContain('EL');
    expect(isEurostatCountry('PL')).toBe(true);
    expect(isEurostatCountry('GR')).toBe(false);
    expect(isEurostatCountry('UA')).toBe(false);
  });

  it('labels divisions in every app language, falling back to English', () => {
    for (const lang of ['en', 'pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl']) {
      for (const d of DIVISIONS) expect(divisionLabel(d, lang).length).toBeGreaterThan(2);
    }
    expect(divisionLabel('CP01', 'xx')).toBe(divisionLabel('CP01', 'en'));
  });
});
