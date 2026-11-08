---
id: more-supported-currencies
title: 'Add CZK, SEK, NOK, DKK, HUF, RON and CHF as supported currencies'
status: building
priority: P2
created_at: 2026-11-08
jira_ticket:
orchestration_run: f8f15083-502c-48fa-ba37-0b53ff533250
---

# Add CZK, SEK, NOK, DKK, HUF, RON and CHF as supported currencies

## User story
As a user living in or travelling through Central and Northern Europe, I want to record expenses, wallets and budgets in my local currency, so that I do not have to relabel everything as EUR or USD.

## Value hypothesis
`SUPPORTED_CURRENCIES` has only seven entries (USD, EUR, PLN, GBP, UAH, RUB, BYN). Polish users regularly cross into Czechia, Hungary and Scandinavia, and the app targets nine European languages, yet any other currency is not selectable at all. The existing `chf-currency-support` idea covers one code; doing the whole group in one change shares the work, since each currency touches the same places.

## Sketch
- Extend the `Currency` union and `SUPPORTED_CURRENCIES` with the new codes, symbols and names.
- Confirm the exchange-rate provider returns each code and the FX fallback tables include them.
- Check bank-notification parsing (`SYMBOL_TO_ISO`) for `Kč`, `kr`, `Ft`, `lei`, `Fr.`; `kr` is ambiguous across SEK, NOK and DKK and should rely on the ISO code or the bank.
- A test that every `SUPPORTED_CURRENCIES` code has a rate and a formatter.
- No migration, since `currencyCode` columns are plain strings.

## Open questions
- Which currencies do we actually have users or requests for? Check admin data first.
- Do mobile and API validators (Zod, DTOs) share one list, or are there copies?
- How to handle the ambiguous `kr` sign in notification capture.

## Cost estimate
2 to 3 days, mostly verification and tests; supersedes `chf-currency-support`.
