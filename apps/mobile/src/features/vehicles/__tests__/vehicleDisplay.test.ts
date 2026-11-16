import { formatConsumption, formatKm, fuelUnitKey, hasConsumption, parseDay, parseLiters, parseOdometer } from '../vehicleDisplay';

describe('vehicleDisplay (ABA-796)', () => {
  it('reads litres with a comma or a dot, rejecting zero and junk', () => {
    expect(parseLiters('42,5')).toBe(42.5);
    expect(parseLiters(' 40.123456 ')).toBe(40.123);
    expect(parseLiters('0')).toBeNull();
    expect(parseLiters('-3')).toBeNull();
    expect(parseLiters('abc')).toBeNull();
    expect(parseLiters('')).toBeNull();
  });

  it('reads an odometer with group separators, never a fraction', () => {
    expect(parseOdometer('123 456')).toBe(123456);
    expect(parseOdometer('123 456')).toBe(123456);
    expect(parseOdometer('123,456')).toBe(123456);
    expect(parseOdometer('0')).toBe(0);
    expect(parseOdometer('-5')).toBeNull();
    expect(parseOdometer('')).toBeNull();
    expect(parseOdometer('12a')).toBeNull();
  });

  it('formats one decimal of consumption and whole kilometres', () => {
    expect(formatConsumption(6.44, 'en-US')).toBe('6.4');
    expect(formatConsumption(null, 'en-US')).toBeNull();
    expect(formatKm(12345.6, 'en-US')).toBe('12,346');
  });

  it('knows when there is nothing to show yet', () => {
    expect(hasConsumption(null)).toBe(false);
    expect(hasConsumption({ consumptionLPer100Km: null })).toBe(false);
    expect(hasConsumption({ consumptionLPer100Km: 5.9 })).toBe(true);
  });
});

describe('vehicleDisplay units and days (ABA-796)', () => {
  it('uses kWh for an electric car only', () => {
    expect(fuelUnitKey('electric')).toBe('vehicles.unitKwh');
    expect(fuelUnitKey('diesel')).toBe('vehicles.unitLiters');
    expect(parseDay('2026-10-05T00:00:00.000Z')).toEqual(new Date(2026, 9, 5));
  });
});
