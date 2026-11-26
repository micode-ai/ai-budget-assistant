import { currencyForCountry, suggestLocalCurrency } from '@budget/shared-utils';
import { activeRemembered, useTravelCurrencyStore } from '../travelCurrencyStore';

const base = { baseCurrency: 'PLN', currentCurrency: 'PLN', dismissedCountries: [] as string[] };

describe('travel currency suggestion', () => {
  it('maps countries to supported currencies only', () => {
    expect(currencyForCountry('cz')).toBe('CZK');
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('JP')).toBeNull();
    expect(currencyForCountry(null)).toBeNull();
  });
  it('suggests when abroad', () => {
    expect(suggestLocalCurrency({ ...base, countryCode: 'CZ' })).toEqual({ countryCode: 'CZ', currency: 'CZK' });
  });
  it('stays quiet at home, unsupported, dismissed or already selected', () => {
    expect(suggestLocalCurrency({ ...base, countryCode: 'PL' })).toBeNull();
    expect(suggestLocalCurrency({ ...base, countryCode: 'JP' })).toBeNull();
    expect(suggestLocalCurrency({ ...base, countryCode: 'CZ', dismissedCountries: ['CZ'] })).toBeNull();
    expect(suggestLocalCurrency({ ...base, countryCode: 'CZ', currentCurrency: 'CZK' })).toBeNull();
  });
  it('expires the remembered currency after its window', () => {
    const r = { a1: { currency: 'CZK', expiresAt: 1000 } };
    expect(activeRemembered(r, 'a1', 999)).toBe('CZK');
    expect(activeRemembered(r, 'a1', 1000)).toBeNull();
    expect(activeRemembered(r, 'other', 1)).toBeNull();
  });
  it('forget drops the remembered currency for that account only', () => {
    const st = useTravelCurrencyStore.getState();
    st.remember('a1', 'CZK', 0);
    st.remember('a2', 'EUR', 0);
    useTravelCurrencyStore.getState().forget('a1');
    const r = useTravelCurrencyStore.getState().remembered;
    expect(r.a1).toBeUndefined();
    expect(r.a2?.currency).toBe('EUR');
  });
  it('recordShown increments the streak', () => {
    useTravelCurrencyStore.getState().resetStreak();
    useTravelCurrencyStore.getState().recordShown();
    expect(useTravelCurrencyStore.getState().streak).toBe(1);
  });
});
