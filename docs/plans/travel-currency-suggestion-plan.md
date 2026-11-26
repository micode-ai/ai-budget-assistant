# Plan: travel-currency-suggestion

- [x] shared-utils: `country-currency.ts` (country → supported currency, `suggestLocalCurrency`)
- [x] mobile: `travelCurrencyStore` (MMKV: dismissed countries, 14-day per-account memory, shown-streak)
- [x] mobile: `countryFromLocation` (OS reverse geocode, native only)
- [x] mobile: `useTravelCurrencySuggestion` hook + chip in `ExpenseCreateForm`
- [x] i18n `travelCurrency.*` in 11 locales
- [x] tests (`features/travelCurrency/__tests__`)
- [x] contract `docs/contracts/travel-currency-suggestion.md`
- [ ] Follow-up: trip-wallet nudge UI (streak is counted, not rendered); desktop web has no signal (no reverse geocode on web)

Decisions: geo is the only signal (device region is unreliable for roamers); the form's existing GPS fix is reused, no new permission ask; web shows nothing.
