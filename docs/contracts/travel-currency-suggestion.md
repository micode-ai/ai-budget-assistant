# Contract: travel currency suggestion

**`@budget/shared-utils`** `currencyForCountry(iso2)` → supported `Currency | null`; `suggestLocalCurrency({countryCode, baseCurrency, currentCurrency, dismissedCountries})` → `{countryCode, currency} | null`. Pure; null when the country is unknown/unsupported, equals the base or current currency, or was dismissed.

**Mobile** `useTravelCurrencySuggestion({accountId, baseCurrency, currentCurrency, location})` → `{suggestion, accept, dismiss, suggestTripWallet}`; `rememberedTravelCurrency(accountId)` seeds the form currency. State in MMKV `travel-currency` (`travelCurrencyStore`): dismissed countries, per-account choice for 14 days, shown-streak.

**Invariants** — never requests location: it consumes the fix `ExpenseCreateForm` already captured (null without permission/toggle); coordinates go only to the OS geocoder and are never stored; accepting relabels the form currency, it does not convert; a dismissal is per country, permanent; unsupported countries show nothing; the API never imports this.
