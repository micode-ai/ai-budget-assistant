# Plan: more-supported-currencies (CZK, SEK, NOK, DKK, HUF, RON, CHF)

Decisions (no live user): ship all seven codes; no admin-data check possible offline. `kr` stays unmapped
(ISO code only). Bare `Ft` and `Fr.` stay unmapped (too ambiguous); `Kč`, `lei` and ISO codes are mapped.

- [x] 1. Plan + contract (`docs/contracts/more-supported-currencies.md`)
- [x] 2. shared-types `Currency`, shared-utils `SUPPORTED_CURRENCIES`, `CurrencySchema`, `currencyConfig`
- [x] 3. API lists: `SUPPORTED_RATE_CURRENCIES`, alerts, AI tool schema, statement validator
- [x] 4. Notification parser: codes + `Kč`/`lei`; drop CHF/CZK from DETECTABLE_UNSUPPORTED
- [x] 5. Tests: every supported code has a formatter and a rate-list entry; fix CHF/CZK-as-unsupported specs
- [x] 6. Wiki page + log, status -> building
